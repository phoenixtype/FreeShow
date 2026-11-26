import type { MatchResult } from "../../../types/ai/Ai"
import type { BibleCacheData } from "./BibleCacheManager"
import { normalizeMishearings } from "./mishearings"
import { normalizeNumbers } from "./numbers"
import { MIN_EVIDENCE, PRESENT_EVIDENCE, quoteEvidence } from "./quoteEvidence"
import { CHAPTER_PATTERN, normalizeBookName, RANGE_PATTERN, VERSE_PATTERN } from "./referenceDictionary"
import { normalizeReferences, withoutOrdinalAside } from "./references"

const COUNTED_WORDS = /^\s*(?:things|people|days|years|times|of|out|is|was|men|women|friends|letters)\b/iu
const LEAD_IN = /\b(?:turn(?: with me)? to|book of|chapter of|in|read|reading|open(?: (?:your|our|the) bibles?)?(?: (?:with me )?(?:to|at))?)\s+(?:the (?:book of )?)?$/iu

// a range stops at the end of the chapter
function rangeEnd(start: number, end: number | undefined, verseCount: number): string {
    const last = Math.min(end || 0, verseCount)
    return last > start ? `-${last}` : ""
}

// group 1: what led up to it; then chapter, verse and range end
const STANDALONE_CHAPTER = new RegExp(`(^|[.!?]\\s*|\\b(?:turn(?: with me)? to|go to|to|in|at|and|then|now|so|read|see|us|from)\\s+(?:the )?)(?:${CHAPTER_PATTERN})\\s*(\\d+)(?:[\\s,:]*(?:(?:and )?(?:${VERSE_PATTERN})\\s*)?(?<=[\\s,:])(\\d+)(?:\\s*(?:[-–—]|${RANGE_PATTERN})\\s*(\\d+))?)?`, "giu")

// "verse eight and nine": the next one, and nothing it could be counting
function andNext(start: number, after: string): number | undefined {
    const next = after.match(/^\s*,?\s*and\s+(?:verse\s+)?(\d+)\b(?![:.]\d)/iu)
    if (!next || Number(next[1]) !== start + 1 || COUNTED_WORDS.test(after.slice(next[0].length))) return undefined
    return start + 1
}

export class BibleSearchDetector {
    constructor(private cacheData: BibleCacheData) {}

    public findReferenceMatch(cleanInput: string): MatchResult | null {
        if (!this.cacheData.refRegex) return null

        const globalRegex = new RegExp(this.cacheData.refRegex.source, "giu")
        const matches = Array.from(cleanInput.matchAll(globalRegex))
        if (matches.length === 0) return null

        for (let i = matches.length - 1; i >= 0; i--) {
            const refMatch = matches[i]
            const matchIndex = refMatch.index ?? 0
            const matchLength = refMatch[0].length

            if (cleanInput.length - (matchIndex + matchLength) > 120) continue

            let matchedBookName = normalizeBookName(refMatch[1])

            const chapterNum = parseInt(refMatch[2], 10)
            const startVerseNum = refMatch[3] ? parseInt(refMatch[3], 10) : undefined
            const endVerseNum = refMatch[4] ? parseInt(refMatch[4], 10) : undefined

            const chapterOf = (name: string) => this.cacheData.referenceIndex.get(`${name.toLowerCase()} ${chapterNum}`)
            let chapterData = chapterOf(matchedBookName)
            // "second John 21 verse 15": no such place in that book, so the number was not part of its name
            if (!chapterData || (startVerseNum || 0) > chapterData.verseCount) {
                matchedBookName = matchedBookName.replace(/^[1-3]\s+/, "")
                chapterData = chapterOf(matchedBookName)
            }
            if (!chapterData) continue

            if (!startVerseNum) {
                if (chapterData.verseCount < 1) continue
                const after = cleanInput.slice(matchIndex + matchLength)
                // "Mark two things", "John 3 years ago": the number counts something else
                if (COUNTED_WORDS.test(after)) continue
                // "John chapter three, and look with me at verse sixteen"
                const later = after.slice(0, 60).match(new RegExp(`\\b(?:${VERSE_PATTERN})\\s*(\\d+)(?:\\s*(?:[-–—]|${RANGE_PATTERN})\\s*(\\d+))?\\b`, "iu"))
                const laterVerse = Number(later?.[1] || 0)
                if (laterVerse >= 1 && laterVerse <= chapterData.verseCount) {
                    const content = `${chapterData.bookName} ${chapterData.chapterNumber}:${laterVerse}${rangeEnd(laterVerse, Number(later![2] || 0), chapterData.verseCount)}`
                    return { type: "scripture", content, confidence: 98 }
                }
                const meant = new RegExp(`\\b(?:${CHAPTER_PATTERN})\\b`, "iu").test(refMatch[0]) || LEAD_IN.test(cleanInput.slice(0, matchIndex)) || !/[\p{L}\p{N}]/u.test(after)
                return {
                    type: "scripture",
                    content: `${chapterData.bookName} ${chapterData.chapterNumber}:1`,
                    confidence: meant ? 75 : 60
                }
            }

            if (startVerseNum < 1 || startVerseNum > chapterData.verseCount) continue

            let referenceContent = `${chapterData.bookName} ${chapterData.chapterNumber}:${startVerseNum}`
            referenceContent += rangeEnd(startVerseNum, endVerseNum ?? andNext(startVerseNum, cleanInput.slice(matchIndex + matchLength)), chapterData.verseCount)

            return {
                type: "scripture",
                content: referenceContent,
                confidence: 98
            }
        }

        return null
    }

    /** "chapter three verse sixteen", in the book that is up; null when no chapter alone was said */
    private findStandaloneChapterMatch(cleanInput: string, currentlyOutputted?: string | null): { match: MatchResult | null } | null {
        const said = Array.from(cleanInput.matchAll(STANDALONE_CHAPTER)).pop()
        if (!said) return null
        const after = cleanInput.slice((said.index ?? 0) + said[0].length)
        if (after.length > 80) return null

        const current = this.parseReference(currentlyOutputted || "")
        const chapterData = current && this.cacheData.referenceIndex.get(`${current.book.toLowerCase()} ${Number(said[2])}`)
        const verse = Number(said[3] || 0)
        if (!chapterData || verse > chapterData.verseCount) return { match: null }
        // a chapter alone ("a new chapter one of our lives") has to be asked for
        if (!verse && !(LEAD_IN.test(said[1]) && !/\p{L}/u.test(after))) return { match: null }

        const content = `${chapterData.bookName} ${chapterData.chapterNumber}:${verse || 1}${verse ? rangeEnd(verse, Number(said[4] || 0), chapterData.verseCount) : ""}`
        return { match: { type: "scripture", content, confidence: 80 } }
    }

    public findStandaloneVerseMatch(cleanInput: string, currentlyOutputted?: string | null, withCue = false): MatchResult | null {
        // a chapter said with it decides which verse is meant, so it comes first
        const chapter = this.findStandaloneChapterMatch(cleanInput, currentlyOutputted)
        if (chapter) return chapter.match

        const verseRegex = new RegExp(`\\b(?:${VERSE_PATTERN})\\s*(\\d+)(?:\\s*(?:[-–—]|${RANGE_PATTERN})\\s*(\\d+))?\\b`, "giu")
        const matches = Array.from(cleanInput.matchAll(verseRegex))
        if (matches.length === 0) return withCue ? this.findNextVerseCue(cleanInput, currentlyOutputted) : null

        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i]
            const matchIndex = match.index ?? 0
            const matchLength = match[0].length

            if (cleanInput.length - (matchIndex + matchLength) > 80) continue

            const startVerseNum = parseInt(match[1], 10)
            const endVerseNum = match[2] ? parseInt(match[2], 10) : undefined

            const priorText = cleanInput.slice(0, matchIndex)
            const inlineRef = this.findReferenceMatch(priorText)
            const targetRef = inlineRef?.content || currentlyOutputted

            if (!targetRef) continue

            const parsedCurrent = this.parseReference(targetRef)
            if (!parsedCurrent) continue

            const refKey = `${parsedCurrent.book.toLowerCase()} ${parsedCurrent.chapter}`
            const chapterData = this.cacheData.referenceIndex.get(refKey)

            if (!chapterData || startVerseNum < 1 || startVerseNum > chapterData.verseCount) continue

            let referenceContent = `${chapterData.bookName} ${chapterData.chapterNumber}:${startVerseNum}`
            referenceContent += rangeEnd(startVerseNum, endVerseNum ?? andNext(startVerseNum, cleanInput.slice(matchIndex + matchLength)), chapterData.verseCount)

            const isSequential = startVerseNum === parsedCurrent.verse + 1

            return {
                type: "scripture",
                content: referenceContent,
                confidence: isSequential ? 85 : 80
            }
        }

        return null
    }

    private tokenizeText(text: string): string[] {
        if (!text || typeof text !== "string") return []
        return text
            .toLowerCase()
            .replace(/['’`\-_]/g, " ")
            .replace(/[^\p{L}\p{N}\s]/gu, "")
            .split(/\s+/)
            .filter((w) => w.length > 1)
    }

    // A reader says the verse number before each verse. Number words are everywhere in talk,
    // so the number has to start a sentence, and the words after it have to be that verse's.
    private findNextVerseCue(cleanInput: string, currentlyOutputted?: string | null): MatchResult | null {
        const current = currentlyOutputted ? this.parseReference(currentlyOutputted) : null
        if (!current) return null

        const said = Array.from(cleanInput.matchAll(/(?:^|[.,;:!?"'\u201d\u2019])\s*(\d+)\b(?![:.]?\d)/g)).pop()
        if (!said) return null
        const after = cleanInput.slice((said.index ?? 0) + said[0].length)
        if (after.length > 80) return null

        const cue = Number(said[1])
        if (cue !== current.verse + 1 && cue !== current.verse + 2) return null

        const chapterData = this.cacheData.referenceIndex.get(`${current.book.toLowerCase()} ${current.chapter}`)
        if (!chapterData || cue > chapterData.verseCount) return null
        const match: MatchResult = { type: "scripture", content: `${chapterData.bookName} ${chapterData.chapterNumber}:${cue}`, confidence: 85 }

        const opening = this.openingWords(chapterData.startVerseId + cue - 1)
        // no words to check it against (an online Bible): offered, not certain
        if (!opening.size) return { ...match, confidence: 70 }
        const confirmed = this.tokenizeText(after)
            .slice(0, 4)
            .filter((word) => opening.has(word)).length
        return confirmed >= 2 ? match : null
    }

    /** the first words of a verse; none when this Bible has no text */
    private openingWords(verseId: number): Set<string> {
        const start = this.cacheData.verseTokensOffsets[verseId]
        const end = Math.min(this.cacheData.verseTokensOffsets[verseId + 1], start + 6)
        const opening = new Set<string>()
        for (let i = start; i < end; i++) opening.add(this.cacheData.vocabPool[this.cacheData.verseTokens[i]])
        return opening
    }

    // share of the verse's word weight that the spoken words account for
    private verseCoverage(verseId: number, queryWords: Set<number>): number {
        let total = 0
        let covered = 0
        for (let i = this.cacheData.verseTokensOffsets[verseId]; i < this.cacheData.verseTokensOffsets[verseId + 1]; i++) {
            const wordId = this.cacheData.verseTokens[i]
            const idf = this.cacheData.wordIdf[wordId]
            if (idf <= 0.3) continue
            total += idf
            if (queryWords.has(wordId)) covered += idf
        }
        return total ? covered / total : 0
    }

    private spokenVerseWords(verseId: number, queryWords: Set<number>) {
        const spoken = new Set<number>()
        for (let i = this.cacheData.verseTokensOffsets[verseId]; i < this.cacheData.verseTokensOffsets[verseId + 1]; i++) {
            const wordId = this.cacheData.verseTokens[i]
            if (queryWords.has(wordId)) spoken.add(wordId)
        }
        return [...spoken].map((wordId) => ({ word: this.cacheData.vocabPool[wordId], idf: this.cacheData.wordIdf[wordId] }))
    }

    // Calculates sequential phrase / n-gram match between input tokens and verse tokens
    private computePhraseMatch(verseId: number, queryWordIds: number[]): { bonus: number; maxRun: number; matchingBigrams: number } {
        if (queryWordIds.length < 2) return { bonus: 1.0, maxRun: queryWordIds.length, matchingBigrams: 0 }

        const start = this.cacheData.verseTokensOffsets[verseId]
        const end = this.cacheData.verseTokensOffsets[verseId + 1]
        const verseLen = end - start
        if (verseLen === 0) return { bonus: 1.0, maxRun: 0, matchingBigrams: 0 }

        const qLen = queryWordIds.length

        // Find the longest contiguous matching sub-sequence of query tokens within the verse
        let maxRun = 0
        for (let i = start; i < end; i++) {
            for (let j = 0; j < qLen; j++) {
                if (this.cacheData.verseTokens[i] === queryWordIds[j]) {
                    let run = 1
                    while (i + run < end && j + run < qLen && this.cacheData.verseTokens[i + run] === queryWordIds[j + run]) {
                        run++
                    }
                    if (run > maxRun) maxRun = run
                }
            }
        }

        // Count matching bigrams (adjacent word pairs)
        let matchingBigrams = 0
        const totalBigrams = qLen - 1
        for (let j = 0; j < totalBigrams; j++) {
            const w1 = queryWordIds[j]
            const w2 = queryWordIds[j + 1]
            for (let i = start; i < end - 1; i++) {
                if (this.cacheData.verseTokens[i] === w1 && this.cacheData.verseTokens[i + 1] === w2) {
                    matchingBigrams++
                    break
                }
            }
        }

        // Exact full phrase match
        if (maxRun === qLen) return { bonus: 1.6, maxRun, matchingBigrams }

        // Substantial contiguous phrase match (e.g. 3+ contiguous words matching)
        if (maxRun >= 3) {
            const runRatio = maxRun / qLen
            return { bonus: 1.2 + runRatio * 0.3, maxRun, matchingBigrams }
        }

        if (matchingBigrams > 0) {
            const bigramRatio = matchingBigrams / totalBigrams
            return { bonus: 1.0 + bigramRatio * 0.4, maxRun, matchingBigrams }
        }

        // For short queries (<= 5 tokens) where words are scattered with 0 adjacent bigrams, apply a penalty
        if (qLen >= 3 && qLen <= 5) return { bonus: 0.65, maxRun, matchingBigrams }

        return { bonus: 1.0, maxRun, matchingBigrams }
    }

    private parseReference(refStr: string): { book: string; chapter: number; verse: number } | null {
        if (!refStr) return null
        const match = refStr.match(/^((?:[1-3]\s+)?[\p{L}\s]+)\s+(\d+):(\d+)(?:-(\d+))?$/u)
        if (!match) return null
        return {
            book: match[1].trim(),
            chapter: parseInt(match[2], 10),
            verse: match[4] ? parseInt(match[4], 10) : parseInt(match[3], 10)
        }
    }

    private getUpcomingVerseMap(currentRefStr: string, maxLookahead: number = 3): Map<number, number> {
        const upcoming = new Map<number, number>()
        const parsed = this.parseReference(currentRefStr)
        if (!parsed) return upcoming

        let currentBook = parsed.book
        let currentChap = parsed.chapter
        let currentVerse = parsed.verse

        for (let dist = 1; dist <= maxLookahead; dist++) {
            const nextVerseNum = currentVerse + 1
            const refKey = `${currentBook.toLowerCase()} ${currentChap}`
            const chapterData = this.cacheData.referenceIndex.get(refKey)

            if (chapterData && nextVerseNum <= chapterData.verseCount) {
                const verseId = chapterData.startVerseId + (nextVerseNum - 1)
                upcoming.set(verseId, dist)
                currentVerse = nextVerseNum
            } else {
                const nextChapKey = `${currentBook.toLowerCase()} ${currentChap + 1}`
                const nextChapData = this.cacheData.referenceIndex.get(nextChapKey)
                if (nextChapData && nextChapData.verseCount >= 1) {
                    const verseId = nextChapData.startVerseId
                    upcoming.set(verseId, dist)
                    currentChap++
                    currentVerse = 1
                } else {
                    break
                }
            }
        }

        return upcoming
    }

    public async findContentMatch(cleanInput: string, currentlyOutputted?: string | null, isCancelled?: () => boolean): Promise<MatchResult | null> {
        const parsedCurrent = this.parseReference(currentlyOutputted || "")
        const upcomingVerseMap = this.getUpcomingVerseMap(currentlyOutputted || "", 3)

        const allTokens = this.tokenizeText(cleanInput)
        if (allTokens.length < 4) return null

        const windowSizes = [20, 60, 80, 120]
        let bestResult: { match: MatchResult | null; hasAnyCandidates: boolean; isAmbiguous: boolean } | null = null

        for (let i = 0; i < windowSizes.length; i++) {
            if (isCancelled?.()) return null
            // a window that already held everything said: a wider one is the same search
            if (i > 0 && allTokens.length <= windowSizes[i - 1]) break

            if (i > 0) {
                await new Promise((resolve) => setTimeout(resolve, 0))
                if (isCancelled?.()) return null
            }

            const size = windowSizes[i]
            const evalResult = this.evaluateContentMatch(allTokens, size, parsedCurrent, upcomingVerseMap, currentlyOutputted)

            if (!evalResult.hasAnyCandidates) break

            if (evalResult.match) {
                if (evalResult.match.confidence >= 80 && !evalResult.isAmbiguous) {
                    return evalResult.match
                }
                if (!bestResult || !bestResult.match || evalResult.match.confidence > bestResult.match.confidence) {
                    bestResult = evalResult
                }
            } else if (!bestResult) {
                bestResult = evalResult
            }
        }

        return bestResult?.match || null
    }

    private evaluateContentMatch(allTokens: string[], windowSize: number, parsedCurrent: { book: string; chapter: number; verse: number } | null, upcomingVerseMap: Map<number, number>, currentlyOutputted?: string | null): { match: MatchResult | null; hasAnyCandidates: boolean; isAmbiguous: boolean } {
        const inputTokens = allTokens.slice(-windowSize)
        const tokenThreshold = 0.3
        const totalTokensCount = inputTokens.length

        const highValueTokensWithWeight: Array<{ wordId: number; weightedIdf: number }> = []

        for (let index = 0; index < inputTokens.length; index++) {
            const token = inputTokens[index]
            const wordId = this.cacheData.vocabToIdMap.get(token)
            if (wordId === undefined) continue

            const idf = this.cacheData.wordIdf[wordId]
            if (idf <= tokenThreshold) continue

            const distanceFromEnd = totalTokensCount - 1 - index
            const decayWeight = Math.pow(0.98, distanceFromEnd)
            highValueTokensWithWeight.push({ wordId, weightedIdf: idf * decayWeight })
        }

        if (highValueTokensWithWeight.length < 2) {
            return { match: null, hasAnyCandidates: false, isAmbiguous: false }
        }

        const candidateScores = new Map<number, number>()
        const candidateMatchedIdfSum = new Map<number, number>()
        const candidateMatchedCount = new Map<number, number>()

        for (const item of highValueTokensWithWeight) {
            const startOffset = this.cacheData.wordPostingsOffsets[item.wordId]
            const endOffset = this.cacheData.wordPostingsOffsets[item.wordId + 1]

            for (let offset = startOffset; offset < endOffset; offset++) {
                const verseId = this.cacheData.wordPostings[offset]
                const prevScore = candidateScores.get(verseId) || 0
                const prevMatchedIdf = candidateMatchedIdfSum.get(verseId) || 0
                const prevCount = candidateMatchedCount.get(verseId) || 0

                candidateScores.set(verseId, prevScore + item.weightedIdf)
                candidateMatchedIdfSum.set(verseId, prevMatchedIdf + item.weightedIdf)
                candidateMatchedCount.set(verseId, prevCount + 1)
            }
        }

        if (candidateScores.size === 0) {
            return { match: null, hasAnyCandidates: false, isAmbiguous: false }
        }

        const recentHighValueIdfSum = inputTokens.reduce((sum, token, index) => {
            const wordId = this.cacheData.vocabToIdMap.get(token)
            if (wordId === undefined) return sum
            const idf = this.cacheData.wordIdf[wordId]
            if (idf <= tokenThreshold) return sum
            const distanceFromEnd = totalTokensCount - 1 - index
            return sum + idf * Math.pow(0.98, distanceFromEnd)
        }, 0)

        const evaluatedCandidates: Array<{
            verseId: number
            ref: string
            finalScore: number
            evidence: number
            quoted: boolean
            isCurrent: boolean
            upcomingDistance: number | null
        }> = []

        const currentVerseId = currentlyOutputted ? this.cacheData.verseToIdMap.get(currentlyOutputted.toLowerCase()) : undefined
        const queryWords = new Set(highValueTokensWithWeight.map((item) => item.wordId))
        const queryWordIds = inputTokens.map((t) => this.cacheData.vocabToIdMap.get(t)).filter((id): id is number => id !== undefined)

        for (const [verseId, accumulatedIdf] of candidateScores.entries()) {
            const matchCount = candidateMatchedCount.get(verseId) || 0

            const isCurrent = currentVerseId === verseId
            const upcomingDist = upcomingVerseMap.get(verseId) ?? null

            let requiredMatches = 2
            if (isCurrent) requiredMatches = 2
            else if (upcomingDist !== null) requiredMatches = 3

            if (matchCount < requiredMatches) continue

            const ref = this.cacheData.versePool[verseId]
            const matchedQueryIdf = candidateMatchedIdfSum.get(verseId) || 1.0
            let scoreRatio = recentHighValueIdfSum > 0 ? matchedQueryIdf / recentHighValueIdfSum : accumulatedIdf / matchedQueryIdf

            scoreRatio = Math.min(scoreRatio, 1.0)

            // not enough even with the best phrase bonus: not worth comparing word order
            const bestBoost = 1.6 * (isCurrent ? 1.25 : upcomingDist === 1 ? 1.15 : 1)
            if (scoreRatio * bestBoost < (isCurrent || upcomingDist === 1 ? 0.18 : 0.28)) continue

            // Bonus for phrase / consecutive word matches vs scattered words
            const phraseMatch = this.computePhraseMatch(verseId, queryWordIds)
            scoreRatio *= phraseMatch.bonus

            // For short inputs (e.g. 4 tokens like "In the beginning God"), require consecutive phrase match (at least 3 contiguous tokens or exact match)
            if (allTokens.length <= 4 && phraseMatch.maxRun < 3 && !isCurrent) continue

            // a handful of common words can match a long verse completely; the match is worth what it covers of the verse
            const coverageTarget = Math.min(0.25, Math.max(0.08, queryWords.size * 0.03))
            scoreRatio *= Math.min(1, this.verseCoverage(verseId, queryWords) / coverageTarget)

            // ordinary talk that happens to share words with a verse is not a quote;
            // reading on from the verse on screen needs less, as it is already expected
            const evidence = quoteEvidence(this.spokenVerseWords(verseId, queryWords), phraseMatch.maxRun)
            if (evidence < (isCurrent || upcomingDist === 1 ? MIN_EVIDENCE / 2 : MIN_EVIDENCE)) continue

            // a retelling shares a verse's words; a quote has them in order, or most of them
            const quoted = phraseMatch.maxRun >= 4 || this.verseCoverage(verseId, queryWords) >= 0.45

            const candidateParsed = this.parseReference(ref)

            if (isCurrent) {
                scoreRatio *= 1.25
            } else if (upcomingDist === 1) {
                scoreRatio *= 1.15
            } else if (upcomingDist === 2) {
                scoreRatio *= 0.75
            } else if (upcomingDist === 3) {
                scoreRatio *= 0.5
            } else if (parsedCurrent && candidateParsed) {
                if (candidateParsed.book.toLowerCase() === parsedCurrent.book.toLowerCase() && candidateParsed.chapter === parsedCurrent.chapter) {
                    if (candidateParsed.verse < parsedCurrent.verse) {
                        scoreRatio *= 0.2
                    } else {
                        const verseDistance = candidateParsed.verse - parsedCurrent.verse
                        scoreRatio *= Math.pow(0.4, verseDistance - 1)
                    }
                } else {
                    scoreRatio *= 0.5
                }
            }

            const threshold = isCurrent || upcomingDist === 1 ? 0.18 : 0.28
            if (scoreRatio >= threshold) {
                evaluatedCandidates.push({
                    verseId,
                    ref,
                    finalScore: scoreRatio,
                    evidence,
                    quoted,
                    isCurrent,
                    upcomingDistance: upcomingDist
                })
            }
        }

        if (evaluatedCandidates.length === 0) {
            return { match: null, hasAnyCandidates: true, isAmbiguous: false }
        }

        evaluatedCandidates.sort((a, b) => b.finalScore - a.finalScore)
        const topMatch = evaluatedCandidates[0]

        let isAmbiguous = false
        let ambiguityPenalty = 1.0
        let uniquenessMultiplier = 1.0

        if (evaluatedCandidates.length > 1) {
            const secondMatch = evaluatedCandidates[1]
            const relativeRatio = secondMatch.finalScore / (topMatch.finalScore || 1)

            if (relativeRatio > 0.75 && !topMatch.isCurrent && topMatch.upcomingDistance !== 1) {
                const topParsed = this.parseReference(topMatch.ref)
                const secondParsed = this.parseReference(secondMatch.ref)

                if (topParsed?.book.toLowerCase() !== secondParsed?.book.toLowerCase() || topParsed?.chapter !== secondParsed?.chapter) {
                    isAmbiguous = true
                    ambiguityPenalty = 1 - (relativeRatio - 0.75)
                }
            } else if (relativeRatio < 0.45) {
                // Dominant winner over the next candidate
                uniquenessMultiplier = 1.25
            } else if (relativeRatio < 0.6) {
                uniquenessMultiplier = 1.15
            }
        } else {
            // Only one candidate in the entire Bible matched
            uniquenessMultiplier = 1.4
        }

        let baseConfidence = topMatch.finalScore * 100 * ambiguityPenalty * uniquenessMultiplier

        // If a candidate uniquely stands out with high score and minimal ambiguity, ensure high confidence so it can suggest/autoplay
        if (!isAmbiguous && uniquenessMultiplier > 1.0 && topMatch.finalScore >= 0.5) {
            baseConfidence = Math.max(baseConfidence, 80)
        }

        // a thin match may be offered, never put on screen by itself
        const expected = topMatch.isCurrent || topMatch.upcomingDistance === 1
        const ceiling = !expected && (topMatch.evidence < PRESENT_EVIDENCE || !topMatch.quoted) ? 74 : 98
        const confidence = Math.min(Math.max(Math.round(baseConfidence), 51), ceiling)

        if (confidence < 70) {
            return { match: null, hasAnyCandidates: true, isAmbiguous }
        }

        return {
            match: { type: "scripture", content: topMatch.ref, confidence, scriptureMatchType: "content" },
            hasAnyCandidates: true,
            isAmbiguous
        }
    }

    /** a reference said outright, whole or as a verse of the passage that is up */
    public findReference(words: string, currentlyOutputted = "", language = "en"): MatchResult | null {
        const forms = [normalizeMishearings(words), words].map((form) => normalizeReferences(normalizeNumbers(form, language), this.cacheData))
        // the verse cue only reads the words as they were heard
        return this.findReferenceMatch(forms[0]) || this.findReferenceMatch(forms[1]) || this.findStandaloneVerseMatch(forms[0], currentlyOutputted) || this.findStandaloneVerseMatch(forms[1], currentlyOutputted, true)
    }

    private readonly DEBUG_MODE = false
    /** language: what is being spoken, for its number words ("any" when it could be several).
     * verseCue: whether a verse number read out moves on to that verse */
    public async search(transcript: string, currentlyOutputted: string, isCancelled?: () => boolean, language = "en", verseCue = true): Promise<MatchResult | null> {
        if (this.DEBUG_MODE) console.log("[DETECTION] Starting search with transcript:", transcript)
        if (isCancelled?.()) return null

        const mishearingsCorrected = normalizeMishearings(transcript)
        const rawNormalizedNumbers = normalizeNumbers(transcript, language)
        const mishearingsNormalizedNumbers = normalizeNumbers(mishearingsCorrected, language)

        const rawNormalized = normalizeReferences(rawNormalizedNumbers, this.cacheData)
        const mishearingsNormalized = normalizeReferences(mishearingsNormalizedNumbers, this.cacheData)

        if (this.DEBUG_MODE) console.log("[DETECTION] Mishearings corrected:", mishearingsCorrected)
        if (this.DEBUG_MODE) console.log("[DETECTION] Mishearings normalized:", mishearingsNormalized)

        let refMatch = this.findReferenceMatch(mishearingsNormalized) || this.findReferenceMatch(rawNormalized) || this.findStandaloneVerseMatch(mishearingsNormalized, currentlyOutputted) || this.findStandaloneVerseMatch(rawNormalized, currentlyOutputted, verseCue)

        // the book without the number, offered rather than certain
        const aside = withoutOrdinalAside(mishearingsCorrected)
        const unnumbered = aside && this.findReferenceMatch(normalizeReferences(normalizeNumbers(aside, language), this.cacheData))
        if (unnumbered) refMatch = { ...unnumbered, confidence: Math.min(unnumbered.confidence, 74) }

        if (this.DEBUG_MODE) console.log("[DETECTION] Reference match result:", refMatch)

        // a reference said outright goes up at once, without waiting on the quote search.
        // 70: a verse number heard where there is no text to check it against
        if (refMatch && refMatch.confidence >= 70) return refMatch
        if (isCancelled?.()) return null

        // 1. Run active-context and fresh-context evaluations simultaneously
        // the same words are not searched twice
        const corrected = this.tokenizeText(mishearingsCorrected).join(" ") !== this.tokenizeText(transcript).join(" ")
        const activeRawPromise = this.findContentMatch(transcript, currentlyOutputted, isCancelled)
        const activeMishearingPromise = corrected ? this.findContentMatch(mishearingsCorrected, currentlyOutputted, isCancelled) : Promise.resolve(null)

        const freshRawPromise = currentlyOutputted ? this.findContentMatch(transcript, null, isCancelled) : Promise.resolve(null)
        const freshMishearingPromise = currentlyOutputted && corrected ? this.findContentMatch(mishearingsCorrected, null, isCancelled) : Promise.resolve(null)

        const [activeRaw, activeMishearing, freshRaw, freshMishearing] = await Promise.all([activeRawPromise, activeMishearingPromise, freshRawPromise, freshMishearingPromise])

        if (isCancelled?.()) return null

        const activeMatch = activeRaw && activeMishearing ? (activeRaw.confidence >= activeMishearing.confidence ? activeRaw : activeMishearing) : activeRaw || activeMishearing

        const freshMatch = freshRaw && freshMishearing ? (freshRaw.confidence >= freshMishearing.confidence ? freshRaw : freshMishearing) : freshRaw || freshMishearing

        let bestContentMatch: MatchResult | null = null

        // 2. Immediate Switch Logic: Prefer fresh context match if active context is absent or weak
        if (freshMatch && (!activeMatch || freshMatch.confidence > activeMatch.confidence + 5)) {
            bestContentMatch = freshMatch
        } else {
            bestContentMatch = activeMatch || freshMatch
        }

        if (this.DEBUG_MODE) console.log("[DETECTION] Best content match:", bestContentMatch)

        return bestContentMatch || null
    }
}
