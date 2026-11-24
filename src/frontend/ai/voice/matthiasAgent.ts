// Matthias at work: hears the name in the transcript, waits for the request to be
// finished, and carries it out with the same paths the operator's own buttons use.

import { get, writable } from "svelte/store"
import { uid } from "uid"
import { startScripture, toggleSttListening } from "../../components/actions/apiHelper"
import { getShortBibleName } from "../../components/drawer/bible/scripture"
import { getFirstActiveOutput, toggleOutputs } from "../../components/helpers/output"
import { clearAll, clearSlide, restoreOutput } from "../../components/output/clear"
import { setActiveScripture } from "../../converters/bible"
import { activeScripture, ai, aiSuggestions, outLocked, scriptures, shows } from "../../stores"
import { agentInstructions, runAgentChat } from "../agent/agentChat"
import { searchBible, ToolError } from "../agent/agentTools"
import { stepScreen } from "../agent/stepScreen"
import { getLLMManager } from "../llm/llmManager"
import { CHAT_RESPONSE_SCHEMA, CHAT_SYSTEM_PROMPT } from "../llm/prompts"
import { AiManager } from "../manager/AiManager"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { presentSong } from "../songs/librarySongs"
import { findCalls, matchTitle, NAME, parseRequest, type Request } from "./matthias"
import { matchVersion } from "./versions"

export interface MatthiasStatus {
    state: "hearing" | "working" | "done" | "failed"
    text: string
}
export const matthiasStatus = writable<MatthiasStatus | null>(null)

const SHOWN_MS = 6000
let statusTimer: ReturnType<typeof setTimeout> | null = null
function say(state: MatthiasStatus["state"], text: string) {
    matthiasStatus.set({ state, text })
    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = state === "done" || state === "failed" ? setTimeout(() => matthiasStatus.set(null), SHOWN_MS) : null
}

// the speech model writes about once a second, so a pause in the words is at least this long
const PAUSE_MS = 1700
const PAUSE_AFTER_PHRASE_MS = 500
const LONGEST_REQUEST_MS = 9000
const REPEAT_MS = 8000
const REWRITE_CHARS = 12

export class Matthias {
    // where the last answered call stood, counted over everything heard
    private static handledAt = -1
    private static pending: { request: string; hey: boolean; at: number; since: number } | null = null
    private static timer: ReturnType<typeof setTimeout> | null = null
    private static last = { words: "", at: 0 }

    static get on() {
        return get(ai).matthias?.name !== false
    }

    /**
     * transcript: the latest words, the first of them "before" characters into all that was heard.
     * True while a request is being spoken: those words are for Matthias, not the sermon.
     */
    static hear(transcript: string, before: number, phraseEnded: boolean): boolean {
        if (!this.on) return false

        // the model rewrites its last words, so a call can move by a few characters
        const call = findCalls(transcript).find((c) => before + c.at > this.handledAt + REWRITE_CHARS)
        if (!call) {
            if (this.pending) this.drop()
            return false
        }

        const changed = this.pending?.request !== call.request
        const since = this.pending?.since ?? Date.now()
        this.pending = { request: call.request, hey: call.hey, at: before + call.at, since }
        if (!changed && !phraseEnded && !call.closed && this.timer) return true

        say("hearing", call.request || "Yes?")
        if (this.timer) clearTimeout(this.timer)
        const finished = call.closed || Date.now() - since > LONGEST_REQUEST_MS
        const wait = finished ? 0 : !call.request ? LONGEST_REQUEST_MS : phraseEnded ? PAUSE_AFTER_PHRASE_MS : PAUSE_MS
        this.timer = setTimeout(() => this.act(), wait)
        return true
    }

    private static drop() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        this.pending = null
        matthiasStatus.set(null)
    }

    private static async act() {
        const asked = this.pending
        this.pending = null
        this.timer = null
        // counted even when nothing comes of it, so it is not asked again
        if (asked) this.handledAt = asked.at
        if (!asked?.request) return matthiasStatus.set(null)

        const words = asked.request.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "")
        if (words === this.last.words && Date.now() - this.last.at < REPEAT_MS && !/next|previous|forward|back/.test(words)) return matthiasStatus.set(null)
        this.last = { words, at: Date.now() }

        await this.ask(asked.request, asked.hey)
    }

    /** a request in words, spoken or typed */
    static async ask(words: string, certain = true): Promise<void> {
        say("working", words)
        try {
            const done = await this.carryOut(parseRequest(words), certain, words)
            if (done === null) matthiasStatus.set(null)
            else say("done", done)
        } catch (err) {
            if (!(err instanceof ToolError)) console.error("Matthias:", err)
            say("failed", err instanceof ToolError ? err.message : `I could not do that: ${words}`)
        }
    }

    /** what was done, in a few words, or null when nothing was meant */
    private static async carryOut(request: Request, certain: boolean, words: string): Promise<string | null> {
        if (request.type === "lock") {
            outLocked.set(request.on)
            return request.on ? "The screen is locked" : "The screen is unlocked"
        }
        if (request.type === "listen") {
            toggleSttListening({ value: false })
            return "Not listening"
        }
        if (request.type === "agent") {
            setAgentMode(request.on)
            return request.on ? "Leading the screen" : "You have the screen"
        }
        if (request.type === "unknown") return await this.think(words, certain)

        if (get(outLocked)) throw new ToolError("The screen is locked")
        switch (request.type) {
            case "screen":
                toggleOutputs(null, { state: request.on })
                return request.on ? "The screen is on" : "The screen is off"
            case "clear":
                if (request.all) clearAll(true)
                else clearSlide()
                AiManager.letGo()
                return "Cleared"
            case "restore":
                restoreOutput()
                return "Back on screen"
            case "slide":
                stepScreen(request.direction)
                return request.direction === "next" ? "Next" : "Previous"
            case "navigate": {
                const scripture = getFirstActiveOutput()?.out?.slide?.id === "temp"
                if (!scripture && request.command.type === "verse-step") {
                    stepScreen(request.command.delta > 0 ? "next" : "previous")
                    return request.command.delta > 0 ? "Next" : "Previous"
                }
                const moved = await AiManager.navigateNow(request.command)
                if (!moved) throw new ToolError("There is no passage to move from")
                return moved
            }
            case "version":
                return this.changeVersion(request.name)
            case "song":
                return this.song(request.name)
            case "search":
                return this.search(request.query, request.topic)
            case "result":
                return this.stepResults(request.direction)
            case "show":
                return this.show(request.what)
        }
    }

    private static async show(what: string): Promise<string> {
        const reference = await AiManager.findReference(what)
        if (reference) return this.passage(reference)
        const song = matchTitle(what, songList())
        if (song) return this.present(song)
        if (what.split(" ").length < 3) throw new ToolError(`I could not find "${what}"`)
        return this.search(what)
    }

    private static async passage(reference: string): Promise<string> {
        await AiManager.showReference(reference)
        return reference
    }

    private static async song(name: string): Promise<string> {
        const song = matchTitle(name, songList())
        if (!song) throw new ToolError(`I do not know which song "${name}" is`)
        return this.present(song)
    }

    private static async present(song: { id: string; name: string }): Promise<string> {
        await AiManager.asOwnChange(song.name, () => presentSong(song.id, ""))
        return song.name
    }

    private static results: string[] = []
    private static resultIndex = 0

    private static async search(query: string, topic = false): Promise<string> {
        // "find John three sixteen" is a reference after all
        const reference = await AiManager.findReference(query)
        if (reference) return this.passage(reference)

        let found: string[] = []
        try {
            found = (await searchBible(topic ? `what the Bible says about ${query}` : query, "BSB")).map((r: { reference: string }) => r.reference.replace(/[–—]/g, "-"))
        } catch (err) {
            // no internet: the words themselves, in a Bible on this computer
            const local = await AiManager.findInLocalBible(query)
            if (!local) throw err
            found = [local]
        }
        if (!found.length) throw new ToolError(`Nothing found for "${query}"`)

        this.results = found
        this.resultIndex = 0
        // the others wait in the list, one tap away
        const others = found.slice(1, 5).map((content) => ({ id: uid(5), timestamp: Date.now(), content, confidence: 60, action: "present", trigger: () => AiManager.showReference(content) }))
        aiSuggestions.update((list) => [...others, ...list.filter((s) => !found.includes(s.content))].slice(0, 15))
        return this.passage(found[0])
    }

    private static async stepResults(direction: "next" | "previous"): Promise<string> {
        if (!this.results.length) throw new ToolError("There is no search to move through")
        const index = this.resultIndex + (direction === "next" ? 1 : -1)
        if (!this.results[index]) throw new ToolError("That was the last one")
        this.resultIndex = index
        return this.passage(this.results[index])
    }

    private static async changeVersion(name: string): Promise<string> {
        const list = Object.entries(get(scriptures)).map(([id, s]) => ({ id, names: [s?.name, s?.customName, (s as any)?.scripturalVersion, (s as any)?.abbreviation, getShortBibleName(s?.name || "")].filter(Boolean) as string[] }))
        const id = matchVersion(name, list)
        if (!id) throw new ToolError(`There is no ${name.toUpperCase()} Bible here`)
        const { reference } = get(activeScripture)
        setActiveScripture(id)
        const label = get(scriptures)[id]?.customName || get(scriptures)[id]?.name || name
        const chapter = reference?.chapters?.[reference.chapters.length - 1]
        const verses = reference?.verses?.[reference.verses.length - 1] || []
        if (reference?.book && chapter && verses.length && getFirstActiveOutput()?.out?.slide?.id === "temp") {
            await AiManager.asOwnChange("", () => startScripture({ id, reference: `${reference.book}.${chapter}.${verses.join(",")}` }))
        }
        return label
    }

    /** not a plain command: the model, when there is one, with the app's own tools */
    private static async think(words: string, certain: boolean): Promise<string | null> {
        const reference = await AiManager.findReference(words)
        if (reference && !get(outLocked)) return this.passage(reference)
        const song = matchTitle(words, songList()) || matchTitle(words.replace(/^\S+\s+/, ""), songList())
        if (song && words.trim().includes(" ") && !get(outLocked)) return this.present(song)
        // the name may have been said in passing
        if (!certain && !get(ai).matthias?.agentMode) return null

        const llm = getLLMManager()
        if (!llm) {
            if (certain) throw new ToolError(`I did not catch that: ${words}`)
            return null
        }
        const systemPrompt = `${CHAT_SYSTEM_PROMPT}${agentInstructions()}\n\nYour name is ${NAME}. This request was spoken aloud in the room and may be misheard. If it is not clearly a request to you, do nothing and answer with an empty content.`
        const answer = await runAgentChat([{ role: "user", content: words }], { ask: (prompt) => llm.request({ systemPrompt, jsonSchema: CHAT_RESPONSE_SCHEMA, prompt }) })
        if (!answer) throw new ToolError("I could not get an answer")
        return answer.content?.trim() || null
    }
}

function songList() {
    return Object.entries(get(shows))
        .filter(([, show]) => show && !show.private)
        .map(([id, show]) => ({ id, name: show.name || "" }))
}

/** full agent mode: the copilot leads the screen by itself until told otherwise */
export function setAgentMode(on: boolean) {
    ai.update((a) => ({ ...a, matthias: { ...(a.matthias || {}), agentMode: on } }))
    // whatever Bible is needed should be ready before the first word of it
    if (on) void BibleCacheManager.getCanon()
}
