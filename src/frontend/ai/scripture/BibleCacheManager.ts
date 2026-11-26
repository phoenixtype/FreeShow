import { Bible } from "json-bible/lib/Bible"
import { get } from "svelte/store"
import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { scriptures } from "../../stores"
import { CANON } from "./canon"
import { BibleSearchDetector } from "./BibleSearchDetector"
import { CHAPTER_PATTERN, ORDINAL_PREFIX_PATTERN, VERSE_PATTERN } from "./referenceDictionary"

export interface BibleCacheData {
    versePool: string[]
    verseToIdMap: Map<string, number>
    referenceIndex: Map<string, { bookName: string; chapterNumber: number; startVerseId: number; verseCount: number }>
    vocabPool: string[]
    vocabToIdMap: Map<string, number>
    wordIdf: Float32Array
    wordPostingsOffsets: Uint32Array
    wordPostings: Uint32Array
    verseTokensOffsets: Uint32Array
    verseTokens: Uint32Array
    bookNames: string[]
    /** other names a book goes by, as they are said: the name this Bible uses */
    aliases?: Record<string, string>
    refRegex: RegExp | null
    totalVerses: number
}

// by book number
const OTHER_NAMES: Record<number, string[]> = { 22: ["song of songs", "canticles", "song of solomon"], 66: ["apocalypse"] }

export class BibleCacheManager {
    // about 17 MB each: the open Bible and the two used before it
    private static readonly MAX_LOADED = 3
    private static caches: Map<string, BibleSearchDetector> = new Map()
    private static rawCaches: Map<string, BibleCacheData> = new Map()
    private static cachePromises: Map<string, Promise<BibleSearchDetector | null>> = new Map()

    public static async getCache(bibleId: string): Promise<BibleSearchDetector | null> {
        const loaded = this.caches.get(bibleId)
        if (loaded) {
            // last used, last to go
            this.caches.delete(bibleId)
            this.caches.set(bibleId, loaded)
            return loaded
        }
        if (this.cachePromises.has(bibleId)) return await this.cachePromises.get(bibleId)!

        const load = async () => {
            const scriptureData = get(scriptures)[bibleId]
            if (!scriptureData || scriptureData?.api) return null

            const bible = (await loadJsonBible(bibleId))?.data
            if (!bible) return null

            const cacheData = await this.buildCacheAsync(bible)
            const searchCache = new BibleSearchDetector(cacheData)

            this.rawCaches.set(bibleId, cacheData)
            this.caches.set(bibleId, searchCache)
            this.dropOldest()
            return searchCache
        }

        const promise = load()
            .catch((err) => {
                console.warn("Live Copilot could not read the Bible", bibleId, err)
                return null
            })
            .then((detector) => {
                // a Bible that did not load is tried again, not remembered as missing
                if (!detector) this.cachePromises.delete(bibleId)
                return detector
            })

        this.cachePromises.set(bibleId, promise)
        return await promise
    }

    private static dropOldest() {
        for (const id of this.loadedIds().slice(0, -this.MAX_LOADED)) {
            this.caches.delete(id)
            this.rawCaches.delete(id)
            this.cachePromises.delete(id)
        }
    }

    /** the Bibles in memory */
    public static loadedIds(): string[] {
        return [...this.caches.keys()]
    }

    private static canon: Promise<BibleSearchDetector> | null = null
    /** references only, for when no Bible is stored on this computer */
    public static getCanon(): Promise<BibleSearchDetector> {
        if (!this.canon) {
            this.canon = this.buildCacheAsync({ books: CANON } as any)
                .then((data) => new BibleSearchDetector(data))
                .catch((err) => {
                    this.canon = null
                    throw err
                })
        }
        return this.canon
    }

    /**
     * Preloads the first local Bibles sequentially in the background without blocking frames.
     */
    public static preloadAllInBackground(allIds: string[]) {
        const bibleIds = allIds.slice(0, this.MAX_LOADED)
        let index = 0
        const loadNext = () => {
            if (index >= bibleIds.length) return
            const id = bibleIds[index++]
            if (!this.caches.has(id) && !this.cachePromises.has(id)) {
                this.getCache(id).then(() => {
                    if ("requestIdleCallback" in window) {
                        window.requestIdleCallback(loadNext)
                    } else {
                        setTimeout(loadNext, 50)
                    }
                })
            } else {
                loadNext()
            }
        }

        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(loadNext)
        } else {
            setTimeout(loadNext, 100)
        }
    }

    /**
     * Instant lookup: Converts a canonical reference or verse ID from one translation directly into another.
     */
    public static getReferenceInTranslation(targetBibleId: string, verseRef: string): string | null {
        const cache = this.rawCaches.get(targetBibleId)
        if (!cache) return null

        const verseId = cache.verseToIdMap.get(verseRef.toLowerCase())
        if (verseId !== undefined && cache.versePool[verseId]) {
            return cache.versePool[verseId]
        }
        return null
    }

    private static tokenizeText(text: string): string[] {
        if (!text || typeof text !== "string") return []
        return text
            .toLowerCase()
            .replace(/['’`\-_]/g, " ")
            .replace(/[^\p{L}\p{N}\s]/gu, "")
            .split(/\s+/)
            .filter((w) => w.length > 1)
    }

    /**
     * Non-blocking cache construction using yield-to-main-thread scheduling.
     */
    private static async buildCacheAsync(bible: Bible): Promise<BibleCacheData> {
        const versePool: string[] = []
        const verseToIdMap: Map<string, number> = new Map()
        const referenceIndex: Map<string, { bookName: string; chapterNumber: number; startVerseId: number; verseCount: number }> = new Map()
        const vocabPool: string[] = []
        const vocabToIdMap: Map<string, number> = new Map()
        const bookNames: string[] = []
        const aliases: Record<string, string> = {}
        let totalVerses = 0

        const tempPostingsMap: Map<number, number[]> = new Map()
        const tempVerseTokensMap: number[][] = []

        let lastYield = performance.now()
        const maybeYield = async () => {
            if (performance.now() - lastYield > 8) {
                // Yield frame if execution takes >8ms
                await new Promise((resolve) => setTimeout(resolve, 0))
                lastYield = performance.now()
            }
        }

        // Pass 1: Build verse pool and reference indices asynchronously
        for (const book of bible.books) {
            bookNames.push(book.name)
            for (const other of OTHER_NAMES[Number(book.number)] || []) if (other !== book.name.toLowerCase()) aliases[other] = book.name
            for (const chapter of book.chapters) {
                const refKey = `${book.name.toLowerCase()} ${chapter.number}`
                const startVerseId = totalVerses
                let chapterVerseCount = 0

                for (const verse of chapter.verses) {
                    const verseRef = `${book.name} ${chapter.number}:${verse.number}`
                    const verseId = totalVerses

                    versePool.push(verseRef)
                    verseToIdMap.set(verseRef.toLowerCase(), verseId)
                    totalVerses++
                    chapterVerseCount++

                    const rawTokens = this.tokenizeText(verse.text)
                    const verseTokenIds: number[] = []
                    const uniqueWordIds = new Set<number>()

                    for (const word of rawTokens) {
                        let wordId = vocabToIdMap.get(word)
                        if (wordId === undefined) {
                            wordId = vocabPool.length
                            vocabToIdMap.set(word, wordId)
                            vocabPool.push(word)
                        }
                        verseTokenIds.push(wordId)
                        uniqueWordIds.add(wordId)
                    }

                    tempVerseTokensMap.push(verseTokenIds)

                    for (const wordId of uniqueWordIds) {
                        let list = tempPostingsMap.get(wordId)
                        if (!list) {
                            list = []
                            tempPostingsMap.set(wordId, list)
                        }
                        list.push(verseId)
                    }
                }

                referenceIndex.set(refKey, {
                    bookName: book.name,
                    chapterNumber: chapter.number,
                    startVerseId,
                    verseCount: chapterVerseCount
                })
            }
            await maybeYield()
        }

        // Pass 2: Pack vocabulary IDFs & word postings into typed arrays
        const vocabSize = vocabPool.length
        const wordIdf = new Float32Array(vocabSize)
        const wordPostingsOffsets = new Uint32Array(vocabSize + 1)

        let totalPostingsCount = 0
        for (let wordId = 0; wordId < vocabSize; wordId++) {
            const list = tempPostingsMap.get(wordId) || []
            wordPostingsOffsets[wordId] = totalPostingsCount
            totalPostingsCount += list.length

            const docFreq = list.length
            wordIdf[wordId] = Math.log((totalVerses + 1) / (docFreq + 1))
        }
        wordPostingsOffsets[vocabSize] = totalPostingsCount

        const wordPostings = new Uint32Array(totalPostingsCount)
        for (let wordId = 0; wordId < vocabSize; wordId++) {
            const list = tempPostingsMap.get(wordId) || []
            const offset = wordPostingsOffsets[wordId]
            for (let i = 0; i < list.length; i++) {
                wordPostings[offset + i] = list[i]
            }
        }

        await maybeYield()

        // Pass 3: Pack verse tokens
        const verseTokensOffsets = new Uint32Array(totalVerses + 1)
        let totalVerseTokensCount = 0

        for (let verseId = 0; verseId < totalVerses; verseId++) {
            const tokens = tempVerseTokensMap[verseId] || []
            verseTokensOffsets[verseId] = totalVerseTokensCount
            totalVerseTokensCount += tokens.length
        }
        verseTokensOffsets[totalVerses] = totalVerseTokensCount

        const verseTokens = new Uint32Array(totalVerseTokensCount)
        for (let verseId = 0; verseId < totalVerses; verseId++) {
            const tokens = tempVerseTokensMap[verseId] || []
            const offset = verseTokensOffsets[verseId]
            for (let i = 0; i < tokens.length; i++) {
                verseTokens[offset + i] = tokens[i]
            }
        }

        const bookPattern = bookNames.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|")
        const refRegex = new RegExp(`\\b((?:(?:[1-3]|${ORDINAL_PREFIX_PATTERN})\\s+)?(?:${bookPattern}))\\b\\s*(?:${CHAPTER_PATTERN})?\\s*(\\d+)(?:[\\s,:.]+(?:${VERSE_PATTERN})?\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?)?`, "iu")

        return {
            versePool,
            verseToIdMap,
            referenceIndex,
            vocabPool,
            vocabToIdMap,
            wordIdf,
            wordPostingsOffsets,
            wordPostings,
            verseTokensOffsets,
            verseTokens,
            bookNames,
            aliases,
            refRegex,
            totalVerses
        }
    }
}
