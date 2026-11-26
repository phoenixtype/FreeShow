import { get, type Unsubscriber } from "svelte/store"
import { uid } from "uid"
import type { AiSuggestion, MatchResult } from "../../../types/ai/Ai"
import type { ConfidenceLevels } from "../../../types/ai/AiSettings"
import type { Detection, DetectionTier } from "../../../types/ai/Records"
import { clone, keysToID } from "../../components/helpers/array"
import { getFirstActiveOutput, setOutput } from "../../components/helpers/output"
import { screenScripture } from "../../components/drawer/bible/scripture"
import { startShow } from "../../components/helpers/showActions"
import { clearAll, clearSlide, restoreOutput } from "../../components/output/clear"
import { setActiveScripture } from "../../converters/bible"
import { ai, aiSmartAction, aiSuggestions, drawerTabsData, outLocked, outputCache, outputs, scriptures } from "../../stores"
import { newToast } from "../../utils/common"
import { handBack, isHeld, movedByHand, OwnChanges, type OwnChange } from "../agent/control"
import { presentPassage } from "../agent/presentPassage"
import { usesAiDetection } from "../llm/aiDetection"
import { getLLMManager } from "../llm/llmManager"
import { logDetection } from "../records/detectionLog"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleVersion } from "../scripture/BibleVersionDetector"
import { detectBibleEvents } from "../scripture/bibleEvents"
import { searchByMeaning } from "../scripture/meaningSearch"
import { isPartOf, isReferenceWithin } from "../scripture/references"
import { parseCopilotCommand, type CopilotCommand } from "../scripture/voiceCommands"
import { followSong, liveShowId, presentSong, songDetector } from "../songs/librarySongs"
import { spokenLanguage, resolveSttEngine } from "../stt/stt"
import { passageStep } from "./passageStep"
import { isAncientWritings } from "../../scriptural/ancientRules"

/** the words something was found in, and how */
interface Heard {
    words: string
    tier: DetectionTier
}

interface Shown {
    content: string
    kind: "scripture" | "song"
    show: () => Promise<unknown>
}

export class AiManager {
    private static lastMatch: number = 0
    private static MAX_LLM_REQUEST_AFTER_MATCH = 5000
    private static latestSearchId: number = 0
    // a search that has had less than this is let finish when the next words arrive
    private static MIN_SEARCH_MS = 500
    private static searches = new Set<{ id: number; startedAt: number }>()
    private static startSearch() {
        const now = Date.now()
        for (const search of this.searches) if (now - search.startedAt >= this.MIN_SEARCH_MS) this.searches.delete(search)
        const search = { id: ++this.latestSearchId, startedAt: now }
        this.searches.add(search)
        return search
    }
    /** what an older search finds now is old news */
    private static cancelSearches(before = Infinity) {
        for (const search of this.searches) if (search.id < before) this.searches.delete(search)
    }

    static async processSTTChunk(chunk: { chunkWithOverlap: string; newWordsCount: number; confidence?: number }) {
        this.triggerBackgroundPreload()
        // watch the output from the first word heard, so slides moved by hand are seen
        this.listenToOutput()

        const search = this.startSearch()
        const isCancelled = () => !this.searches.has(search)
        const superseded = () => search.id !== this.latestSearchId

        // a spoken command ("next verse") moves the screen and is not searched for
        const newWords = chunk.chunkWithOverlap.split(/\s+/).slice(-chunk.newWordsCount).join(" ")
        const command = this.catches("commands") ? parseCopilotCommand(newWords, false) : null
        // a command that moved nothing (no passage on screen) is searched like any other words
        if (command && (await this.navigate(command, false, newWords))) return

        const stringMatch = await this.stringDetection(chunk.chunkWithOverlap, isCancelled)
        if (isCancelled()) return

        if (stringMatch) {
            this.cancelSearches(search.id)
            const tier = stringMatch.type === "scripture_version" ? "version" : stringMatch.scriptureMatchType === "content" ? "quote" : "reference"
            this.newMatch(stringMatch, false, { words: chunk.chunkWithOverlap, tier })
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
            this.newMatch(eventMatch, true, { words: chunk.chunkWithOverlap, tier: "event" })
            this.lastMatch = Date.now()
            return
        }

        // anything past here can spend AI requests: only when switched on, or in agent mode,
        // and only for the newest words
        if (!usesAiDetection(get(ai)) || superseded()) return
        if (this.lastMatch && Date.now() - this.lastMatch < this.MAX_LLM_REQUEST_AFTER_MATCH) return

        const meaningMatch = await searchByMeaning(chunk.chunkWithOverlap, chunk.newWordsCount, superseded)
        if (superseded()) return
        if (meaningMatch) {
            this.newMatch(meaningMatch, false, { words: chunk.chunkWithOverlap, tier: "meaning" })
            this.lastMatch = Date.now()
            return
        }

        const llmManager = getLLMManager()
        if (!llmManager) return

        // only report to LLM if nothing is auto detected
        const llmMatch = await llmManager.detectMatch(chunk)
        // a newer chunk has spoken since: this answer is stale
        if (superseded()) return
        if (llmMatch) {
            this.newMatch(llmMatch, false, { words: chunk.chunkWithOverlap, tier: "model" })
            this.lastMatch = Date.now()
        }
    }

    // each way of catching things is on unless switched off
    private static catches(way: "verseCue" | "events" | "commands"): boolean {
        return get(ai).scripture?.[way] !== false
    }

    private static numberLanguage(): string {
        return spokenLanguage(get(ai).stt?.engineOptions?.[resolveSttEngine()]?.language) || "any"
    }

    /** everything said between two pauses: only here do the one-word commands count. True when it moved the screen */
    static async processUtterance(text: string): Promise<boolean> {
        if (!this.catches("commands")) return false
        // phrases that count mid-sentence were acted on as they were heard
        if (parseCopilotCommand(text, false)) return false
        const command = parseCopilotCommand(text, true)
        if (!command) return false

        this.listenToOutput()
        // what is still being searched was said before this
        this.latestSearchId++
        this.cancelSearches()
        return this.navigate(command, false, text)
    }

    private static async stringDetection(textChunk: string, isCancelled?: () => boolean) {
        const scriptureMatch = await this.globalBibleDetection(textChunk, isCancelled)
        if (scriptureMatch) return scriptureMatch

        const scriptureVersionMatch = await detectBibleVersion(textChunk, isCancelled)
        if (scriptureVersionMatch) return scriptureVersionMatch

        return null
    }

    private static async songDetection(text: string): Promise<boolean> {
        const heard = songDetector()?.push(text)
        if (!heard) return false
        // a preacher quoting a hymn over a reading is not the choir starting
        const hit = !heard.sustained && this.scriptureRecently() ? { ...heard, confidence: Math.min(heard.confidence, 74) } : heard
        const recent = text.split(/\s+/).slice(-16).join(" ")

        // already up: on an auto-present setting, keep the screen on the line being sung,
        // unless someone moved the slides by hand in the last half minute
        if (hit.id === liveShowId()) {
            this.heardAgain()
            if (this.autoLevel("lyrics") === "ask" || hit.confidence <= 50) return true
            if (isHeld()) return true
            this.listenToOutput()
            this.expectOwnChange({ show: hit.id })
            if (await followSong(hit.id, recent)) this.outputUpdate(hit.name)
            else this.ownChanges.settle()
            return true
        }

        this.newMatch({ type: "lyrics", content: hit.name, confidence: hit.confidence, showId: hit.id, lyricsText: recent }, false, { words: text, tier: "song" })
        return true
    }

    private static SCRIPTURE_RECENT_MS = 60_000
    private static lastScripture = 0
    /** a passage is up, or was in the last minute */
    private static scriptureRecently(): boolean {
        if (get(screenScripture)?.reference?.book && getFirstActiveOutput()?.out?.slide?.id === "temp") this.lastScripture = Date.now()
        return Date.now() - this.lastScripture < this.SCRIPTURE_RECENT_MS
    }

    private static autoLevel(type: "scripture" | "lyrics"): ConfidenceLevels {
        const chosen = get(ai)[type]?.confidence || "ask"
        // leading by itself: certain and likely matches go up, whatever the setting
        return get(ai).matthias?.agentMode && (chosen === "ask" || chosen === "highest") ? "high" : chosen
    }

    // famous events and parables said in passing: "when Jesus walked on water".
    // Only ever offered: nobody asked for the passage
    private static eventDetection(textChunk: string): MatchResult | null {
        if (!this.catches("events")) return null
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

    // heard: the words of a command that was overheard, not asked for
    private static async navigate(command: CopilotCommand, asked = false, heard = ""): Promise<boolean> {
        // a repeat within the cooldown still counts as handled
        if (Date.now() - this.lastCommand < this.COMMAND_COOLDOWN) return true

        const step = await passageStep(command)
        if (!step || (step.id && isAncientWritings(step.id))) return false

        this.lastCommand = Date.now()
        const { content } = step
        this.navigatedTo = content
        const found: Omit<Detection, "action"> | null = heard ? { heard, tier: "command", confidence: 100, found: content } : null
        const trigger = async () => {
            await this.present(content, step.reference, step.id)
            this.note(found, "shown")
        }

        // commands follow the scripture setting: presented directly, or offered when set to "ask"
        const draft = { id: uid(5), timestamp: Date.now(), content, confidence: 100 }
        if (!asked && (isHeld() || this.autoLevel("scripture") === "ask")) {
            this.note(found, "offered")
            this.addSuggestion({ ...draft, action: "present", trigger })
            return true
        }

        this.addSuggestion({ ...draft, action: "presented", trigger })
        await trigger()
        return true
    }

    private static isPreloadStarted: boolean = false
    private static triggerBackgroundPreload() {
        if (this.isPreloadStarted) return
        this.isPreloadStarted = true

        // load scriptures
        const open = get(drawerTabsData)?.scripture?.activeSubTab || ""
        const localScriptureIds = this.getLocalScriptureIds()
        BibleCacheManager.preloadAllInBackground([...localScriptureIds].sort((a, b) => Number(b === open) - Number(a === open)))
    }

    private static getLocalScriptureIds() {
        return keysToID(get(scriptures))
            .filter((a) => !a.api && !a.collection && !isAncientWritings(a.id))
            .map((a) => a.id)
    }

    private static scriptureAlerted: boolean = false
    private static async globalBibleDetection(textChunk: string, isCancelled?: () => boolean) {
        const localIds = this.getLocalScriptureIds()
        const openBibleId = get(drawerTabsData)?.scripture?.activeSubTab || ""

        // an online Bible has no words here to listen against: spoken references are
        // followed all the same, and quotes through any Bible stored on this computer
        const open = localIds.includes(openBibleId)
        const readId = open ? openBibleId : localIds[0]

        // none stored, or one that will not load: references only
        if (!readId || !(await BibleCacheManager.getCache(readId))) {
            if (!localIds.length) {
                if (!this.scriptureAlerted) newToast("Listening for references. Download a Bible to also catch verses as they are quoted.")
                this.scriptureAlerted = true
            }
            return (await BibleCacheManager.getCanon()).search(textChunk, AiManager.liveContent, isCancelled, this.numberLanguage(), this.catches("verseCue"))
        }

        const match = await this.bibleDetection(readId, textChunk, isCancelled)
        if (!match) return null
        if (!open) {
            delete match.scriptureTranslation
            return match
        }
        const activeBibleId = openBibleId

        // reference type matches stays on the active scripture
        if (match.scriptureMatchType !== "content") return match

        let highestConfidence = match.confidence || 0

        // Non-blocking concurrent scan
        Promise.all(
            // only those in memory: loading every translation for every quote would never settle
            BibleCacheManager.loadedIds().map(async (id) => {
                // already checked
                if (id === activeBibleId) return

                const otherMatch = await this.bibleDetection(id, textChunk, isCancelled)
                if (otherMatch?.confidence && otherMatch.confidence > highestConfidence) {
                    highestConfidence = otherMatch.confidence
                    this.newMatch({ ...otherMatch, scriptureIsNewTranslation: true }, false, { words: textChunk, tier: "quote" })
                }
            })
        ).catch((err) => console.warn("Live Copilot could not search the other Bibles", err))

        return match
    }

    private static async bibleDetection(id: string, textChunk: string, isCancelled?: () => boolean) {
        const bibleCache = await BibleCacheManager.getCache(id)
        if (!bibleCache || isCancelled?.()) return null

        const match = await bibleCache.search(textChunk, AiManager.liveContent, isCancelled, this.numberLanguage(), this.catches("verseCue"))
        if (!match) return null

        match.scriptureTranslation = id
        return match
    }

    /////

    // being put up: not yet live, and not to be put up a second time
    private static pendingContent = ""

    static newMatch(match: MatchResult, offerOnly = false, heard?: Heard) {
        if (match.type === "empty" || !match.content) return
        // a verse of the range on screen being read keeps the whole range up
        if (match.type === "scripture" && (AiManager.liveContent === match.content || isReferenceWithin(AiManager.liveContent, match.content))) {
            this.heardAgain()
            return
        }

        if (match.type !== "scripture" && match.type !== "scripture_version" && match.type !== "lyrics") return
        if (match.content === this.pendingContent && !match.scriptureIsNewTranslation) return

        let suggestionDraft: any = {
            id: uid(5),
            timestamp: Date.now(),
            content: match.content,
            confidence: match.confidence,
            ...(match.type === "lyrics" ? { kind: "song" } : {})
        }
        if (match.scriptureIsNewTranslation) suggestionDraft.scriptureTranslation = match.scriptureTranslation

        const found: Omit<Detection, "action"> | null = heard ? { heard: heard.words, tier: heard.tier, confidence: match.confidence, found: match.content } : null
        const trigger = async () => {
            const up = await this.triggerMatchAction(match)
            if (up) this.note(found, "shown")
            return up
        }

        if (!offerOnly && this.shouldAutoPlay(match)) {
            const suggestion = { ...suggestionDraft, action: "presented", trigger }
            this.addSuggestion(suggestion)

            console.info(`Auto-playing ${match.type}:`, match.content)
            this.pendingContent = match.content
            trigger().then((up) => {
                if (this.pendingContent === match.content) this.pendingContent = ""
                // it did not go up: still on offer, not part of what was shown
                if (up) return
                this.note(found, "offered")
                aiSuggestions.update((list) => list.map((a) => (a.id === suggestion.id ? { ...a, action: match.type === "lyrics" ? "present_song" : "present" } : a)))
            })
            return
        }

        // the same words heard again within moments are one offer
        if (!this.alreadySuggested(match)) this.note(found, "offered")

        if (match.type === "scripture_version") {
            const suggestion = { ...suggestionDraft, action: "open_scripture", trigger }
            this.addSuggestion(suggestion)
            return
        }

        const suggestion = { ...suggestionDraft, action: match.type === "lyrics" ? "present_song" : "present", trigger }
        this.addSuggestion(suggestion)
    }

    // the last detection that went on screen, so taking it back is written down too
    private static lastDetected: Omit<Detection, "action"> | null = null
    private static note(found: Omit<Detection, "action"> | null, action: Detection["action"]) {
        if (!found) return
        if (action === "shown") this.lastDetected = found
        logDetection({ ...found, action })
    }

    // long enough for the words that found it to have gone by; "back to verse sixteen" later is shown
    private static RESHOW_BLOCK_MS = 20_000
    private static alreadySuggested(match: MatchResult): boolean {
        return get(aiSuggestions).some((a) => a.content === match.content && a.confidence >= match.confidence && Date.now() - a.timestamp < this.RESHOW_BLOCK_MS)
    }

    private static shouldAutoPlay(match: MatchResult): boolean {
        if (match.confidence <= 95 && this.alreadySuggested(match)) return false

        if (match.type === "scripture_version") return false
        if (match.type !== "scripture" && match.type !== "lyrics") return false

        if (match.type === "scripture" && match.scriptureIsNewTranslation) return false

        // just taken back with Undo: the same words are still being heard
        if (this.takenBack.content === match.content && Date.now() - this.takenBack.at < this.RESHOW_BLOCK_MS) return false

        // never auto-play low confidence matches
        if (match.confidence <= 50) return false

        // the operator has just moved the screen
        if (isHeld() || get(outLocked)) return false

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
    private static async triggerMatchAction(match: MatchResult): Promise<boolean> {
        try {
            if (match.type === "scripture_version") {
                if (match.scriptureTranslation) setActiveScripture(match.scriptureTranslation)
            } else if (match.type === "scripture") {
                await this.present(match.content, match.content)
            } else if (match.type === "lyrics" && match.showId) {
                const { showId, lyricsText } = match
                await this.asOwnChange(match.content, () => presentSong(showId, lyricsText || ""), { show: showId })
                this.markShown(match.content)
            }
            return true
        } catch (err) {
            console.warn("Live Copilot could not present", match.content, err)
            return false
        }
    }

    // something on offer that was put up joins what was shown, with the time
    private static markShown(content: string) {
        aiSuggestions.update((list) => list.map((a) => (a.content === content && a.action !== "open_scripture" ? { ...a, action: "presented", timestamp: Date.now() } : a)))
    }

    // Output changes the copilot makes itself are not "moved by hand".
    private static ownChanges = new OwnChanges()
    private static expectOwnChange(change: OwnChange) {
        const out = getFirstActiveOutput()?.out
        this.undone = { slide: clone(out?.slide || null), scripture: get(screenScripture), content: this.liveContent }
        this.ownChanges.expect(change)
    }
    private static outputUpdate(content: string) {
        this.liveContent = content
        this.heardAgain()
        handBack()
    }

    // what was up before the copilot's last change, to put back
    private static undone: { slide: any; scripture: any; content: string } | null = null
    // what the copilot has put up, newest last
    private static shown: Shown[] = []
    private static remember(content: string, kind: Shown["kind"], show: () => Promise<unknown>) {
        if (!content) return
        this.markShown(content)
        this.shown = [...this.shown.filter((entry) => entry.content !== content), { content, kind, show }].slice(-20)
    }

    private static async present(content: string, reference: string, id = "") {
        let up = false
        await this.asOwnChange(content, async () => (up = await presentPassage(reference, id)), "passage")
        if (!up) {
            this.liveContent = ""
            throw new Error(`${content} could not be put up`)
        }
        this.lastScripture = Date.now()
        this.remember(content, "scripture", () => this.present(content, reference, id))
    }

    // MATTHIAS: asked for by name, so shown whatever the settings say

    static async findReference(words: string): Promise<string | null> {
        const detector = await this.referenceDetector()
        return detector.findReference(words, this.liveContent, this.numberLanguage())?.content || null
    }
    private static async referenceDetector() {
        const open = get(drawerTabsData)?.scripture?.activeSubTab || ""
        const local = this.getLocalScriptureIds()
        const id = local.includes(open) ? open : local[0]
        return (id && (await BibleCacheManager.getCache(id))) || (await BibleCacheManager.getCanon())
    }
    static async findInLocalBible(words: string): Promise<string | null> {
        return (await (await this.referenceDetector()).search(words, "", undefined, this.numberLanguage()))?.content || null
    }
    static async showReference(reference: string) {
        await this.present(reference, reference)
        this.addSuggestion({ id: uid(5), timestamp: Date.now(), content: reference, confidence: 100, action: "presented", trigger: () => this.showReference(reference) })
    }
    /** slide: which one to start at (from 0); left out, the one that matches what is being sung */
    static async showSong(song: { id: string; name: string }, slide?: number) {
        const show = () => this.asOwnChange(song.name, () => (slide === undefined ? presentSong(song.id, "") : startShow(song.id, slide)), { show: song.id })
        await show()
        this.remember(song.name, "song", show)
    }
    /** content: what will be up, or "" when that stays what it is */
    static async asOwnChange(content: string, change: () => unknown, expected: OwnChange = "any") {
        this.listenToOutput()
        this.expectOwnChange(expected)
        try {
            await change()
        } finally {
            // "any" is only for changes that are done when they say so; a passage is still landing
            if (expected !== "passage") this.ownChanges.settle()
        }
        this.outputUpdate(content || this.liveContent)
    }
    static async showAgain(): Promise<string> {
        return this.reshow(this.shown[this.shown.length - 1])
    }
    /** the last thing shown that is not up now */
    static async showBefore(kind?: Shown["kind"]): Promise<string> {
        return this.reshow([...this.shown].reverse().find((entry) => entry.content !== this.liveContent && (!kind || entry.kind === kind)))
    }
    private static async reshow(entry: Shown | undefined): Promise<string> {
        if (!entry) return ""
        await entry.show()
        return entry.content
    }

    /** takes the words, or everything, off the screen; undoChange brings it back */
    static clearScreen(all = false) {
        this.listenToOutput()
        this.expectOwnChange("nothing")
        if (all) {
            clearAll(true)
            this.undone = null
        } else clearSlide()
        this.outputUpdate("")
        if (this.clearTimer) clearTimeout(this.clearTimer)
    }
    private static takenBack = { content: "", at: 0 }
    /** true while this is what the copilot last put up, and Undo would take it back */
    static canUndo(content: string): boolean {
        return !!content && this.liveContent === content && !!this.undone && !get(outLocked)
    }
    /** what was up before the copilot's last change */
    static undoChange(): boolean {
        const before = this.undone
        if (!before && !get(outputCache)) return false
        this.takenBack = { content: this.liveContent, at: Date.now() }
        if (this.lastDetected && this.lastDetected.found === this.liveContent) this.note(this.lastDetected, "undone")
        this.lastDetected = null
        this.listenToOutput()
        this.ownChanges.expect("any")
        this.undone = null
        if (before) {
            setOutput("slide", before.slide)
            screenScripture.set(before.scripture)
        } else restoreOutput()
        this.ownChanges.settle()
        this.outputUpdate(before?.content || "")
        return true
    }

    // In agent mode a passage or song comes down once the speaker has moved on. Only what
    // the copilot put up itself: anything moved by hand empties liveContent.
    private static CLEAR_AFTER_MINUTES = 2
    private static clearTimer: ReturnType<typeof setTimeout> | null = null
    private static heardAgain() {
        if (this.clearTimer) clearTimeout(this.clearTimer)
        this.clearTimer = null
        const minutes = get(ai).matthias?.clearAfter ?? this.CLEAR_AFTER_MINUTES
        if (!get(ai).matthias?.agentMode || !minutes || !this.liveContent) return
        const content = this.liveContent
        this.clearTimer = setTimeout(() => {
            if (!get(ai).matthias?.agentMode || this.liveContent !== content || get(outLocked)) return
            if (isHeld()) return
            this.clearScreen()
        }, minutes * 60_000)
    }

    /////

    private static smartActionTimer: NodeJS.Timeout | null = null
    private static SMART_ACTION_DURATION = 30 * 1000 // 30 seconds
    private static setSmartAction(content: AiSuggestion) {
        aiSmartAction.set(content)

        // long enough to read it and press Undo
        const TIMEOUT = content.action === "presented" ? 8000 : this.SMART_ACTION_DURATION

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
    private static SHOWN_LIMIT = 50
    private static STILL_SPEAKING_MS = 6000
    private static addSuggestion(content: AiSuggestion) {
        this.setSmartAction(content)

        aiSuggestions.update((list) => {
            const now = Date.now()

            // offers time out; what was put up stays for the session
            let active = list.filter((a) => a.action === "presented" || now - a.timestamp < this.SUGGESTION_MAX_AGE)

            // remove duplicate suggestions, but an offer does not wipe the record of a showing
            active = active.filter((a) => a.id !== content.id && (a.content !== content.content || (a.action === "presented" && content.action !== "presented")))

            // the first half of a reference is replaced by the whole of it
            if (content.kind !== "song") active = active.filter((a) => a.action === "presented" || now - a.timestamp > this.STILL_SPEAKING_MS || !isPartOf(a.content, content.content, a.confidence <= 75))

            let shown = 0
            let offered = 0
            return [content, ...active].filter((a) => (a.action === "presented" ? ++shown <= this.SHOWN_LIMIT : ++offered <= this.SUGGESTION_LIMIT))
        })
    }

    /////

    private static outputListener: Unsubscriber | null = null
    static listenToOutput() {
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

            if (!initialized || this.ownChanges.isOwn(slide)) return
            // moved by hand: hold off auto-present, and what was on screen is no longer live
            movedByHand()
            this.liveContent = ""
        })
    }
}
