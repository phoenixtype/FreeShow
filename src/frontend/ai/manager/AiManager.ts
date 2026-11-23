import { get, type Unsubscriber } from "svelte/store"
import { uid } from "uid"
import type { AiSuggestion, MatchResult } from "../../../types/ai/Ai"
import type { ConfidenceLevels } from "../../../types/ai/AiSettings"
import { startScripture } from "../../components/actions/apiHelper"
import { keysToID } from "../../components/helpers/array"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { setActiveScripture } from "../../converters/bible"
import { activeScripture, ai, aiSmartAction, aiSuggestions, drawerTabsData, outputs, scriptures } from "../../stores"
import { newToast } from "../../utils/common"
import { getLLMManager } from "../llm/llmManager"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleVersion } from "../scripture/BibleVersionDetector"
import { detectBibleEvents } from "../scripture/bibleEvents"
import { searchByMeaning } from "../scripture/meaningSearch"
import { isReferenceWithin } from "../scripture/references"
import { parseCopilotCommand, type CopilotCommand } from "../scripture/voiceCommands"
import { resolveNavigation } from "../scripture/voiceNavigation"
import { followSong, liveShowId, presentSong, songDetector } from "../songs/librarySongs"

export class AiManager {
    private static lastMatch: number = 0
    private static MAX_LLM_REQUEST_AFTER_MATCH = 5000
    private static latestSearchId: number = 0

    static async processSTTChunk(chunk: { chunkWithOverlap: string; newWordsCount: number; confidence?: number }) {
        this.triggerBackgroundPreload()

        const searchId = ++this.latestSearchId
        const isCancelled = () => searchId !== this.latestSearchId

        // a spoken command ("next verse") moves the screen and is not searched for
        const newWords = chunk.chunkWithOverlap.split(/\s+/).slice(-chunk.newWordsCount).join(" ")
        const command = parseCopilotCommand(newWords)
        if (command) {
            await this.navigate(command)
            return
        }

        const stringMatch = await this.stringDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return

        if (stringMatch) {
            this.newMatch(stringMatch)
            this.lastMatch = Date.now()
            return
        }

        // a song from the library being sung (before events and meaning: lyrics quote scripture)
        if (await this.songDetection(chunk.chunkWithOverlap)) {
            this.lastMatch = Date.now()
            return
        }

        const eventMatch = this.eventDetection(chunk.chunkWithOverlap)
        if (eventMatch) {
            this.newMatch(eventMatch)
            this.lastMatch = Date.now()
            return
        }

        if (this.lastMatch && Date.now() - this.lastMatch < this.MAX_LLM_REQUEST_AFTER_MATCH) return

        const meaningMatch = await searchByMeaning(chunk.chunkWithOverlap, chunk.newWordsCount, isCancelled)
        if (isCancelled()) return
        if (meaningMatch) {
            this.newMatch(meaningMatch)
            this.lastMatch = Date.now()
            return
        }

        const llmManager = getLLMManager()
        if (!llmManager) return

        // only report to LLM if nothing is auto detected
        const llmMatch = await llmManager.detectMatch(chunk)
        if (llmMatch) {
            this.newMatch(llmMatch)
            this.lastMatch = Date.now()
        }
    }

    private static async stringDetection(textChunk: string, isCancelled?: () => boolean) {
        const scriptureMatch = await this.globalBibleDetection(textChunk, isCancelled)
        if (scriptureMatch) return scriptureMatch

        const scriptureVersionMatch = await detectBibleVersion(textChunk, isCancelled)
        if (scriptureVersionMatch) return scriptureVersionMatch

        return null
    }

    private static async songDetection(text: string): Promise<boolean> {
        const hit = songDetector()?.push(text)
        if (!hit) return false
        const recent = text.split(/\s+/).slice(-16).join(" ")

        // already up: on an auto-present setting, keep the screen on the line being sung,
        // unless someone moved the slides by hand in the last half minute
        if (hit.id === liveShowId()) {
            if (this.autoLevel("lyrics") === "ask" || hit.confidence <= 50) return true
            if (this.lastOutputUpdate && Date.now() - this.lastOutputUpdate < this.MAX_AUTO_PLAY_INTERVAL) return true
            this.listenToOutput()
            if (await followSong(hit.id, recent)) this.outputUpdate(hit.name)
            return true
        }

        this.newMatch({ type: "lyrics", content: hit.name, confidence: hit.confidence, showId: hit.id, lyricsText: recent })
        return true
    }

    private static autoLevel(type: "scripture" | "lyrics"): ConfidenceLevels {
        return get(ai)[type]?.confidence || "ask"
    }

    // famous events and parables said in passing: "when Jesus walked on water"
    // (capped below "high" so they are offered, not presented, by default)
    private static eventDetection(textChunk: string): MatchResult | null {
        const event = detectBibleEvents(textChunk)[0]
        if (!event) return null
        return { type: "scripture", content: event.reference, confidence: event.confidence >= 0.88 ? 74 : 65 }
    }

    private static lastCommand = 0
    private static COMMAND_COOLDOWN = 1500
    private static async navigate(command: CopilotCommand) {
        if (Date.now() - this.lastCommand < this.COMMAND_COOLDOWN) return

        const { id, reference } = get(activeScripture)
        if (!id || !reference?.book || !reference.chapters?.length) return

        const chapter = Number(reference.chapters[reference.chapters.length - 1])
        const verses = (reference.verses?.[reference.verses.length - 1] || []).map((v) => parseInt(String(v), 10)).filter((v) => !isNaN(v))
        const verse = verses.length ? Math.max(...verses) : 1

        const bible = (await loadJsonBible(id))?.data
        const book = bible?.books?.find((b) => Number(b.number) === Number(reference.book))
        if (!book) return

        const chapterOf = (n: number) => book.chapters.find((c) => Number(c.number) === n)
        const target = resolveNavigation(command, { chapter, verse }, { chapterCount: book.chapters.length, verseCount: (n) => chapterOf(n)?.verses.length || 0 })
        if (!target) return

        this.lastCommand = Date.now()
        const content = `${book.name} ${target.chapter}:${target.verse}`
        const trigger = () => {
            startScripture({ id, reference: `${reference.book}.${target.chapter}.${target.verse}` })
            this.outputUpdate(content)
        }

        // commands follow the scripture setting: presented directly, or offered when set to "ask"
        const draft = { id: uid(5), timestamp: Date.now(), content, confidence: 100 }
        if ((get(ai).scripture?.confidence || "ask") === "ask") {
            this.addSuggestion({ ...draft, action: "present", trigger })
            return
        }

        this.addSuggestion({ ...draft, action: "presented" })
        trigger()
    }

    private static isPreloadStarted: boolean = false
    private static triggerBackgroundPreload() {
        if (this.isPreloadStarted) return
        this.isPreloadStarted = true

        // load scriptures
        const localScriptureIds = this.getLocalScriptureIds()
        BibleCacheManager.preloadAllInBackground(localScriptureIds)
    }

    private static getLocalScriptureIds() {
        return keysToID(get(scriptures))
            .filter((a) => !a.api && !a.collection)
            .map((a) => a.id)
    }

    private static scriptureAlerted: boolean = false
    private static async globalBibleDetection(textChunk: string, isCancelled?: () => boolean) {
        const activeBibleId = get(drawerTabsData)?.scripture?.activeSubTab
        if (!activeBibleId) return null

        const scriptureData = get(scriptures)[activeBibleId]
        if (scriptureData?.api) {
            if (!this.scriptureAlerted) newToast("Please use a local Bible instead of an API Bible for the auto detection!")
            this.scriptureAlerted = true
            return null
        }

        const match = await this.bibleDetection(activeBibleId, textChunk, isCancelled)
        if (!match) return null

        // reference type matches stays on the active scripture
        if (match.scriptureMatchType !== "content") return match

        let highestConfidence = match.confidence || 0

        // Non-blocking concurrent scan
        Promise.all(
            this.getLocalScriptureIds().map(async (id) => {
                // already checked
                if (id === activeBibleId) return

                const otherMatch = await this.bibleDetection(id, textChunk, isCancelled)
                if (otherMatch?.confidence && otherMatch.confidence > highestConfidence) {
                    highestConfidence = otherMatch.confidence
                    this.newMatch({ ...otherMatch, scriptureIsNewTranslation: true })
                }
            })
        )

        return match
    }

    private static async bibleDetection(id: string, textChunk: string, isCancelled?: () => boolean) {
        const bibleCache = await BibleCacheManager.getCache(id)
        if (!bibleCache || isCancelled?.()) return null

        const match = await bibleCache.search(textChunk, AiManager.liveContent, isCancelled)
        if (!match) return null

        match.scriptureTranslation = id
        return match
    }

    /////

    static newMatch(match: MatchResult) {
        if (match.type === "empty" || !match.content) return
        if (match.type === "scripture" && AiManager.liveContent === match.content) return

        if (match.type !== "scripture" && match.type !== "scripture_version" && match.type !== "lyrics") return

        let suggestionDraft: any = {
            id: uid(5),
            timestamp: Date.now(),
            content: match.content,
            confidence: match.confidence
        }
        if (match.scriptureIsNewTranslation) suggestionDraft.scriptureTranslation = match.scriptureTranslation

        const trigger = () => this.triggerMatchAction(match)

        if (this.shouldAutoPlay(match)) {
            const suggestion = { ...suggestionDraft, action: "presented" }
            this.addSuggestion(suggestion)

            console.info(`Auto-playing ${match.type}:`, match.content)
            trigger()
            return
        }

        if (match.type === "scripture_version") {
            const suggestion = { ...suggestionDraft, action: "open_scripture", trigger }
            this.addSuggestion(suggestion)
            return
        }

        const suggestion = { ...suggestionDraft, action: match.type === "lyrics" ? "present_song" : "present", trigger }
        this.addSuggestion(suggestion)
    }

    private static alreadySuggested(match: MatchResult): boolean {
        // get suggested, but remove any suggestions that have lower confidence than the current match
        const suggested = get(aiSuggestions)
            .filter((a) => a.content !== match.content || a.confidence >= match.confidence)
            .filter((a) => !isReferenceWithin(match.content, a.content))
            .map((item) => item.content)

        return suggested.includes(match.content)
    }

    private static MAX_AUTO_PLAY_INTERVAL = 30000
    private static shouldAutoPlay(match: MatchResult): boolean {
        if (match.confidence <= 95 && this.alreadySuggested(match)) return false

        if (match.type === "scripture_version") return false
        if (match.type !== "scripture" && match.type !== "lyrics") return false

        if (match.type === "scripture" && match.scriptureIsNewTranslation) return false

        // never auto-play low confidence matches
        if (match.confidence <= 50) return false

        const now = Date.now()
        // skip if the output was manually updated recently
        if (this.lastOutputUpdate && now - this.lastOutputUpdate < this.MAX_AUTO_PLAY_INTERVAL) return false

        const confidence = this.autoLevel(match.type)
        if (confidence === "ask") return false

        const autoPlay = match.confidence > this.getConfidenceScore(confidence)
        if (autoPlay) this.listenToOutput()
        return autoPlay
    }

    private static getConfidenceScore(confidence: ConfidenceLevels): number {
        if (confidence === "highest") return 95
        if (confidence === "high") return 75
        if (confidence === "medium") return 50
        return 100
    }

    static liveContent: string = ""
    private static triggerMatchAction(match: MatchResult) {
        if (match.type === "scripture_version") {
            if (match.scriptureTranslation) setActiveScripture(match.scriptureTranslation)
        } else if (match.type === "scripture") {
            startScripture({ reference: match.content })
            this.outputUpdate(match.content)
        } else if (match.type === "lyrics" && match.showId) {
            presentSong(match.showId, match.lyricsText || "")
            this.outputUpdate(match.content)
        }
    }

    private static outputUpdate(content: string) {
        this.liveContent = content

        setTimeout(() => {
            // reset output updates when not "manually" played
            this.lastOutputUpdate = 0
        }, 500)
    }

    /////

    private static smartActionTimer: NodeJS.Timeout | null = null
    private static SMART_ACTION_DURATION = 30 * 1000 // 30 seconds
    private static setSmartAction(content: AiSuggestion) {
        aiSmartAction.set(content)

        const TIMEOUT = content.action === "presented" ? 4000 : this.SMART_ACTION_DURATION

        if (this.smartActionTimer) {
            clearTimeout(this.smartActionTimer)
            this.smartActionTimer = null
        }
        this.smartActionTimer = setTimeout(() => {
            this.smartActionTimer = null
            aiSmartAction.update((a) => (a?.id === content.id ? null : a))
        }, TIMEOUT)
    }

    private static SUGGESTION_MAX_AGE = 5 * 60 * 1000 // 5 minutes
    private static SUGGESTION_LIMIT = 15
    private static addSuggestion(content: AiSuggestion) {
        this.setSmartAction(content)

        aiSuggestions.update((list) => {
            const now = Date.now()

            // remove timed out suggestions
            let active = list.filter((a) => now - a.timestamp < this.SUGGESTION_MAX_AGE)

            // remove duplicate suggestions
            active = active.filter((a) => a.id !== content.id && a.content !== content.content)

            return [content, ...active].slice(0, this.SUGGESTION_LIMIT)
        })
    }

    /////

    private static lastOutputUpdate = 0
    private static outputListener: Unsubscriber | null = null
    private static listenToOutput() {
        if (this.outputListener) return

        let initialized = false
        setTimeout(() => (initialized = true), 1000)

        let previousOutput = ""
        this.outputListener = outputs.subscribe(() => {
            const firstOutput = getFirstActiveOutput()
            const slide = firstOutput?.out?.slide || null

            const slideKey = JSON.stringify(slide)
            if (slideKey === JSON.stringify(previousOutput)) return
            previousOutput = slideKey

            if (initialized) this.lastOutputUpdate = Date.now()
        })
    }
}
