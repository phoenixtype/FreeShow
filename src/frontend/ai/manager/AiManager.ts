import { get, type Unsubscriber } from "svelte/store"
import { uid } from "uid"
import type { AiSuggestion, MatchResult } from "../../../types/ai/Ai"
import type { ConfidenceLevels } from "../../../types/ai/AiSettings"
import { startScripture } from "../../components/actions/apiHelper"
import { keysToID } from "../../components/helpers/array"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { clearSlide } from "../../components/output/clear"
import { setActiveScripture } from "../../converters/bible"
import { activeScripture, ai, aiSmartAction, aiSuggestions, drawerTabsData, outLocked, outputs, scriptures } from "../../stores"
import { newToast } from "../../utils/common"
import { getLLMManager } from "../llm/llmManager"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleVersion } from "../scripture/BibleVersionDetector"
import { detectBibleEvents } from "../scripture/bibleEvents"
import { searchByMeaning } from "../scripture/meaningSearch"
import { isPartOf, isReferenceWithin } from "../scripture/references"
import { parseCopilotCommand, type CopilotCommand } from "../scripture/voiceCommands"
import { resolveNavigation } from "../scripture/voiceNavigation"
import { followSong, liveShowId, presentSong, songDetector } from "../songs/librarySongs"

export class AiManager {
    private static lastMatch: number = 0
    private static MAX_LLM_REQUEST_AFTER_MATCH = 5000
    private static latestSearchId: number = 0

    static async processSTTChunk(chunk: { chunkWithOverlap: string; newWordsCount: number; confidence?: number; utterance?: string }) {
        this.triggerBackgroundPreload()
        // watch the output from the first word heard, so slides moved by hand are seen
        this.listenToOutput()

        const searchId = ++this.latestSearchId
        const isCancelled = () => searchId !== this.latestSearchId

        // a spoken command ("next verse") moves the screen and is not searched for
        const newWords = chunk.chunkWithOverlap.split(/\s+/).slice(-chunk.newWordsCount).join(" ")
        const command = parseCopilotCommand(newWords, false) || (chunk.utterance ? parseCopilotCommand(chunk.utterance, true) : null)
        // a command that moved nothing (no passage on screen) is searched like any other words
        if (command && (await this.navigate(command))) return

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
        // a newer chunk has spoken since: this answer is stale
        if (isCancelled()) return
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
            this.heardAgain()
            if (this.autoLevel("lyrics") === "ask" || hit.confidence <= 50) return true
            if (this.lastOutputUpdate && Date.now() - this.lastOutputUpdate < this.MAX_AUTO_PLAY_INTERVAL) return true
            this.listenToOutput()
            this.expectOwnChange()
            if (await followSong(hit.id, recent)) this.outputUpdate(hit.name)
            return true
        }

        this.newMatch({ type: "lyrics", content: hit.name, confidence: hit.confidence, showId: hit.id, lyricsText: recent })
        return true
    }

    private static autoLevel(type: "scripture" | "lyrics"): ConfidenceLevels {
        const chosen = get(ai)[type]?.confidence || "ask"
        // leading by itself: certain and likely matches go up, whatever the setting
        return get(ai).silas?.agentMode && (chosen === "ask" || chosen === "highest") ? "high" : chosen
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
    /** steps the passage on screen because it was asked for by name: the new reference, or "" */
    static async navigateNow(command: CopilotCommand): Promise<string> {
        this.lastCommand = 0
        this.listenToOutput()
        return (await this.navigate(command, true)) ? this.navigatedTo : ""
    }
    private static navigatedTo = ""

    private static async navigate(command: CopilotCommand, asked = false): Promise<boolean> {
        // a repeat within the cooldown still counts as handled
        if (Date.now() - this.lastCommand < this.COMMAND_COOLDOWN) return true

        const { id, reference } = get(activeScripture)
        if (!id || !reference?.book || !reference.chapters?.length) return false

        const chapter = Number(reference.chapters[reference.chapters.length - 1])
        const verses = (reference.verses?.[reference.verses.length - 1] || []).map((v) => parseInt(String(v), 10)).filter((v) => !isNaN(v))
        const verse = verses.length ? Math.max(...verses) : 1

        const bible = (await loadJsonBible(id))?.data
        const book = bible?.books?.find((b) => Number(b.number) === Number(reference.book))
        if (!book) return false

        const chapterOf = (n: number) => book.chapters.find((c) => Number(c.number) === n)
        const target = resolveNavigation(command, { chapter, verse }, { chapterCount: book.chapters.length, verseCount: (n) => chapterOf(n)?.verses.length || 0 })
        if (!target) return false

        this.lastCommand = Date.now()
        const content = `${book.name} ${target.chapter}:${target.verse}`
        this.navigatedTo = content
        const trigger = async () => {
            this.expectOwnChange()
            await startScripture({ id, reference: `${reference.book}.${target.chapter}.${target.verse}` })
            this.outputUpdate(content)
        }

        // commands follow the scripture setting: presented directly, or offered when set to "ask"
        const draft = { id: uid(5), timestamp: Date.now(), content, confidence: 100 }
        if (!asked && this.autoLevel("scripture") === "ask") {
            this.addSuggestion({ ...draft, action: "present", trigger })
            return true
        }

        this.addSuggestion({ ...draft, action: "presented", trigger })
        trigger()
        return true
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
        const localIds = this.getLocalScriptureIds()
        const openBibleId = get(drawerTabsData)?.scripture?.activeSubTab || ""

        // an online Bible has no words here to listen against: spoken references are
        // followed all the same, and quotes through any Bible stored on this computer
        if (!localIds.includes(openBibleId)) {
            if (!localIds.length) {
                if (!this.scriptureAlerted) newToast("Listening for references. Download a Bible to also catch verses as they are quoted.")
                this.scriptureAlerted = true
                return await (await BibleCacheManager.getCanon()).search(textChunk, AiManager.liveContent, isCancelled)
            }
            const match = await this.bibleDetection(localIds[0], textChunk, isCancelled)
            if (match) delete match.scriptureTranslation
            return match
        }
        const activeBibleId = openBibleId

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
        if (match.type === "scripture" && AiManager.liveContent === match.content) {
            this.heardAgain()
            return
        }

        if (match.type !== "scripture" && match.type !== "scripture_version" && match.type !== "lyrics") return

        let suggestionDraft: any = {
            id: uid(5),
            timestamp: Date.now(),
            content: match.content,
            confidence: match.confidence,
            ...(match.type === "lyrics" ? { kind: "song" } : {})
        }
        if (match.scriptureIsNewTranslation) suggestionDraft.scriptureTranslation = match.scriptureTranslation

        const trigger = () => this.triggerMatchAction(match)

        if (this.shouldAutoPlay(match)) {
            const suggestion = { ...suggestionDraft, action: "presented", trigger }
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
    private static async triggerMatchAction(match: MatchResult) {
        try {
            if (match.type === "scripture_version") {
                if (match.scriptureTranslation) setActiveScripture(match.scriptureTranslation)
            } else if (match.type === "scripture") {
                this.expectOwnChange()
                await startScripture({ reference: match.content })
                this.outputUpdate(match.content)
            } else if (match.type === "lyrics" && match.showId) {
                this.expectOwnChange()
                await presentSong(match.showId, match.lyricsText || "")
                this.outputUpdate(match.content)
            }
        } catch (err) {
            console.warn("Live Copilot could not present", match.content, err)
        }
    }

    // Output changes the copilot makes itself are not "moved by hand". Loading a
    // song or a Bible can take a few seconds, so the window runs from just before
    // the present until shortly after it lands.
    private static ownChangeUntil = 0
    private static expectOwnChange() {
        this.ownChangeUntil = Date.now() + 15_000
    }
    private static outputUpdate(content: string) {
        this.liveContent = content
        this.heardAgain()
        this.lastOutputUpdate = 0
        this.ownChangeUntil = Date.now() + 1500
    }

    // SILAS: asked for by name, so shown whatever the settings say

    static async findReference(words: string): Promise<string | null> {
        const detector = await this.referenceDetector()
        return detector.findReference(words, this.liveContent)?.content || null
    }
    private static async referenceDetector() {
        const open = get(drawerTabsData)?.scripture?.activeSubTab || ""
        const local = this.getLocalScriptureIds()
        const id = local.includes(open) ? open : local[0]
        return (id && (await BibleCacheManager.getCache(id))) || (await BibleCacheManager.getCanon())
    }
    static async findInLocalBible(words: string): Promise<string | null> {
        return (await (await this.referenceDetector()).search(words, ""))?.content || null
    }
    static async showReference(reference: string) {
        await this.asOwnChange(reference, () => startScripture({ reference }))
        this.addSuggestion({ id: uid(5), timestamp: Date.now(), content: reference, confidence: 100, action: "presented", trigger: () => this.showReference(reference) })
    }
    static async asOwnChange(content: string, change: () => Promise<unknown>) {
        this.listenToOutput()
        this.expectOwnChange()
        await change()
        this.outputUpdate(content || this.liveContent)
    }
    /** nothing of the copilot's is on screen any more */
    static letGo() {
        this.expectOwnChange()
        this.outputUpdate("")
        if (this.clearTimer) clearTimeout(this.clearTimer)
    }

    // In agent mode a passage or song comes down once the speaker has moved on. Only what
    // the copilot put up itself: anything moved by hand empties liveContent.
    private static CLEAR_AFTER_MINUTES = 2
    private static clearTimer: ReturnType<typeof setTimeout> | null = null
    private static heardAgain() {
        if (this.clearTimer) clearTimeout(this.clearTimer)
        this.clearTimer = null
        const minutes = get(ai).silas?.clearAfter ?? this.CLEAR_AFTER_MINUTES
        if (!get(ai).silas?.agentMode || !minutes || !this.liveContent) return
        const content = this.liveContent
        this.clearTimer = setTimeout(() => {
            if (!get(ai).silas?.agentMode || this.liveContent !== content || get(outLocked)) return
            this.letGo()
            clearSlide()
        }, minutes * 60_000)
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
    private static STILL_SPEAKING_MS = 6000
    private static addSuggestion(content: AiSuggestion) {
        this.setSmartAction(content)

        aiSuggestions.update((list) => {
            const now = Date.now()

            // remove timed out suggestions
            let active = list.filter((a) => now - a.timestamp < this.SUGGESTION_MAX_AGE)

            // remove duplicate suggestions
            active = active.filter((a) => a.id !== content.id && a.content !== content.content)

            // the first half of a reference is replaced by the whole of it
            if (content.kind !== "song") active = active.filter((a) => a.action === "presented" || now - a.timestamp > this.STILL_SPEAKING_MS || !isPartOf(a.content, content.content, a.confidence <= 75))

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
            // previousOutput is already a string: comparing it stringified again never matched
            if (slideKey === previousOutput) return
            previousOutput = slideKey

            if (!initialized || Date.now() < this.ownChangeUntil) return
            // moved by hand: hold off auto-present, and what was on screen is no longer live
            this.lastOutputUpdate = Date.now()
            this.liveContent = ""
        })
    }
}
