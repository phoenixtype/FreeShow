// What an agent can do in the app. One list, used by the chat inside the app and
// by outside agents through the app's own MCP server (src/electron/agent). Every
// tool checks what it was given, says plainly what happened, and nothing here
// deletes anything.

import { get } from "svelte/store"
import { uid } from "uid"
import { activeProject, aiSuggestions, outLocked, projects, shows, showsCache, sttTranscript, ai } from "../../stores"
import { addToProject, createProject, getClearedState, getPlainText, playMedia, startScripture, toggleSttListening } from "../../components/actions/apiHelper"
import { getOutputSlideText } from "../../components/actions/apiGet"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { loadShows } from "../../components/helpers/setShow"
import { getLayoutRef } from "../../components/helpers/show"
import { startShow } from "../../components/helpers/showActions"
import { clearAll, clearSlide } from "../../components/output/clear"
import { nextProgramSegment, playPauseSpeaker, startProgram } from "../../components/drawer/timers/speakerTimerActions"
import { convertText } from "../../converters/txt"
import { ANON_KEY, FUNCTIONS_URL } from "../../scriptural/connection"
import { copilotListening } from "../liveCopilot"
import { stepScreen } from "./stepScreen"
import { onScreenTitle } from "../components/floating/onScreen"
import { readPassage } from "../scripture/passage"

export interface AgentTool {
    name: string
    description: string
    inputSchema: { type: "object"; properties: Record<string, any>; required?: string[] }
    readOnly?: boolean
    /** not offered to the in-app chat or listed to outside agents: used by the app's own server */
    internal?: boolean
    run: (args: any) => Promise<unknown> | unknown
}

export class ToolError extends Error {}

const text = (description: string) => ({ type: "string", description })
const none = { type: "object" as const, properties: {} }

const requireUnlocked = () => {
    if (get(outLocked)) throw new ToolError("The screen is locked in the app. The operator has to unlock it first.")
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** waits for the screen to show what was asked, so the answer is what happened and not what was sent */
async function until(done: () => boolean, timeoutMs = 6000): Promise<boolean> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
        if (done()) return true
        await settle(100)
    }
    return done()
}

function liveState() {
    const output = getFirstActiveOutput()
    const slide = output?.out?.slide
    const cleared = getClearedState()
    const plain = (value: unknown) =>
        typeof value === "string"
            ? value
                  .replace(/<[^>]*>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
            : ""
    const words =
        slide?.id === "temp"
            ? (slide.tempItems || [])
                  .flatMap((item) => item?.lines || [])
                  .map((line) => (line?.text || []).map((part) => part?.value || "").join(""))
                  .join("\n")
            : getOutputSlideText()
    const scriptureWords = slide?.id === "temp" ? plain(slide.customDynamicValues?.scripture_text) : ""
    const total = slide?.id && slide.id !== "temp" && get(showsCache)[slide.id] ? getLayoutRef(slide.id).length : 0

    return {
        screen: output?.name || "",
        outputId: output?.id || "",
        locked: get(outLocked),
        nothingOnScreen: cleared.all,
        showing: slide ? { kind: slide.id === "temp" ? "scripture" : "presentation", title: onScreenTitle(slide, get(shows)), ...(total ? { slide: (slide.index ?? 0) + 1, slides: total } : {}), words: scriptureWords || plain(words) || words } : null,
        background: output?.out?.background ? output.out.background.name || output.out.background.path || output.out.background.id || "" : null,
        openPlan: get(projects)[get(activeProject) || ""]?.name || null,
        copilot: { on: !!get(ai).enabled, listening: get(copilotListening), agentMode: !!get(ai).silas?.agentMode }
    }
}

// a song by name: the exact title, or the only one containing the words. Several close
// matches come back as a question rather than a guess on screen.
export function findByName(list: { [id: string]: { name?: string; private?: boolean } }, name: string): { id: string; name: string } {
    const wanted = String(name || "")
        .trim()
        .toLowerCase()
    if (!wanted) throw new ToolError("Say which one, by name or id.")
    const entries = Object.entries(list).filter(([, item]) => item && !item.private)
    const byId = entries.find(([id]) => id === name)
    const exact = entries.filter(([, item]) => item.name?.trim().toLowerCase() === wanted)
    const partial = entries.filter(([, item]) => item.name?.toLowerCase().includes(wanted))
    const match = byId || exact[0] || (partial.length === 1 ? partial[0] : null)
    if (match) return { id: match[0], name: match[1].name || "" }
    if (partial.length)
        throw new ToolError(
            `Several match "${name}": ${partial
                .slice(0, 8)
                .map(([id, item]) => `${item.name} (${id})`)
                .join("; ")}. Use the full name or the id.`
        )
    throw new ToolError(`Nothing named "${name}" was found.`)
}

export async function searchBible(query: string, version: string) {
    let response: Response
    try {
        response = await fetch(`${FUNCTIONS_URL}/search-scripture`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ query, version, limit: 8 }),
            signal: AbortSignal.timeout(15_000)
        })
    } catch {
        throw new ToolError("Scripture search could not be reached. Check the internet connection, or use read_passage with a reference.")
    }
    if (!response.ok) throw new ToolError("Scripture search is not answering. Try again in a moment.")
    const { results = [] } = await response.json()
    return results.map((r: any) => ({ reference: r.reference, text: r.text, version: r.version }))
}

export const agentTools: AgentTool[] = [
    {
        name: "get_live_state",
        description: "What is on the screen right now (title, words, slide number), whether the screen is locked, the open service plan, and whether the Live Copilot is listening. Call this first.",
        inputSchema: none,
        readOnly: true,
        run: liveState
    },
    {
        name: "get_transcript",
        description: "The most recent words the Live Copilot heard from the microphone, and the passages or songs it found in them.",
        inputSchema: { type: "object", properties: { words: { type: "integer", description: "How many of the latest words to return (default 150, at most 1500)" } } },
        readOnly: true,
        run: ({ words }) => {
            const count = Math.min(1500, Math.max(1, Number(words) || 150))
            const { finalized, unprocessed } = get(sttTranscript)
            return {
                transcript: `${finalized} ${unprocessed}`.trim().split(/\s+/).slice(-count).join(" "),
                found: get(aiSuggestions).map((s) => ({ id: s.id, what: s.content, confidence: s.confidence, shown: s.action === "presented" }))
            }
        }
    },
    {
        name: "show_found",
        description: "Put one of the Live Copilot's found passages or songs (an id from get_transcript) on screen.",
        inputSchema: { type: "object", properties: { id: text("The id from get_transcript") }, required: ["id"] },
        run: async ({ id }) => {
            requireUnlocked()
            const found = get(aiSuggestions).find((s) => s.id === id)
            if (!found?.trigger) throw new ToolError("That is no longer in the list. Call get_transcript again.")
            found.trigger()
            await settle(1200)
            return liveState()
        }
    },
    {
        name: "set_listening",
        description: "Turn the Live Copilot's microphone listening on or off.",
        inputSchema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
        run: async ({ on }) => {
            if (!get(ai).enabled || !get(ai).stt?.micDeviceId) throw new ToolError("The Live Copilot is not set up. The operator turns it on in Settings, Live Copilot, and picks a microphone.")
            toggleSttListening({ value: !!on } as any)
            await until(() => get(copilotListening) === !!on, 8000)
            return { listening: get(copilotListening) }
        }
    },
    {
        name: "set_agent_mode",
        description: "Let the app lead the screen by itself from what it hears (scripture, songs, clearing up), or hand it back to the operator.",
        inputSchema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
        run: ({ on }) => {
            ai.update((a) => ({ ...a, silas: { ...(a.silas || {}), agentMode: !!on } }))
            return { agentMode: !!on }
        }
    },
    {
        name: "search_bible",
        description: 'Find Bible passages by wording or meaning ("God loved the world so much he gave his son"). Needs the internet.',
        inputSchema: { type: "object", properties: { query: text("Words or an idea"), version: text("Version code for the returned text, such as KJV") }, required: ["query"] },
        readOnly: true,
        run: ({ query, version }) => searchBible(String(query), String(version || "KJV"))
    },
    {
        name: "read_passage",
        description: "The words of a passage in the church's open Bible, without showing it.",
        inputSchema: { type: "object", properties: { reference: text('Such as "John 3:16" or "Romans 8:28-30"') }, required: ["reference"] },
        readOnly: true,
        run: async ({ reference }) => {
            const passage = await readPassage(String(reference))
            if (!passage) throw new ToolError(`${reference} was not found in the open Bible. Check the reference, or open a Bible in the Scripture drawer.`)
            return passage
        }
    },
    {
        name: "show_scripture",
        description: "Put a passage on screen in the church's open Bible.",
        inputSchema: { type: "object", properties: { reference: text('Such as "John 3:16" or "Romans 8:28-30"') }, required: ["reference"] },
        run: async ({ reference }) => {
            requireUnlocked()
            const passage = await readPassage(String(reference))
            if (!passage) throw new ToolError(`${reference} was not found in the open Bible. Check the reference, or open a Bible in the Scripture drawer.`)
            const before = JSON.stringify(getFirstActiveOutput()?.out?.slide || null)
            await startScripture({ reference: String(reference) })
            const shown = await until(() => getFirstActiveOutput()?.out?.slide?.id === "temp" && JSON.stringify(getFirstActiveOutput()?.out?.slide) !== before)
            // asking for what is already up changes nothing, and that is fine
            const live = liveState()
            if (!shown && live.showing?.kind !== "scripture") throw new ToolError("The passage did not reach the screen. Check that a screen is switched on.")
            return { shown: passage, screen: live.showing }
        }
    },
    {
        name: "list_songs",
        description: "Songs and presentations in the library, optionally only those with these words in the name.",
        inputSchema: { type: "object", properties: { filter: text("Words in the name") } },
        readOnly: true,
        run: ({ filter }) => {
            const needle = String(filter || "").toLowerCase()
            const list = Object.entries(get(shows))
                .filter(([, show]) => show && !show.private && (!needle || show.name?.toLowerCase().includes(needle)))
                .map(([id, show]) => ({ id, name: show.name }))
            return { count: list.length, songs: list.slice(0, 100) }
        }
    },
    {
        name: "get_song",
        description: "The words of a song or presentation, slide by slide.",
        inputSchema: { type: "object", properties: { name: text("Name or id") }, required: ["name"] },
        readOnly: true,
        run: async ({ name }) => {
            const found = findByName(get(shows), name)
            const { value } = await getPlainText(found.id)
            return { ...found, words: value }
        }
    },
    {
        name: "add_song",
        description: "Add a song to the library. A blank line between slides; a line like [Verse 1] or [Chorus] starts a section. Only words the church may use, never invented ones.",
        inputSchema: { type: "object", properties: { title: text("Title"), lyrics: text("The words") }, required: ["title", "lyrics"] },
        run: ({ title, lyrics }) => {
            const name = String(title).trim()
            if (!name || !String(lyrics).trim()) throw new ToolError("A song needs a title and its words.")
            const existing = Object.values(get(shows)).find((show) => show?.name?.trim().toLowerCase() === name.toLowerCase())
            if (existing) throw new ToolError(`"${existing.name}" is already in the library.`)
            const { id } = convertText({ name, text: String(lyrics), category: "song", noFormatting: true, open: false })
            return { added: name, id }
        }
    },
    {
        name: "present_song",
        description: "Put a song or presentation on screen, from its first slide or a given one.",
        inputSchema: { type: "object", properties: { name: text("Name or id"), slide: { type: "integer", description: "Slide number, from 1" } }, required: ["name"] },
        run: async ({ name, slide }) => {
            requireUnlocked()
            const found = findByName(get(shows), name)
            await loadShows([found.id])
            const total = getLayoutRef(found.id).length
            const index = Math.max(1, Number(slide) || 1) - 1
            if (index >= total) throw new ToolError(`"${found.name}" has ${total} slide${total === 1 ? "" : "s"}.`)
            await startShow(found.id, index)
            if (!(await until(() => getFirstActiveOutput()?.out?.slide?.id === found.id, 3000))) throw new ToolError("It did not reach the screen. Check that a screen is switched on.")
            return liveState().showing
        }
    },
    {
        name: "control_screen",
        description: "Move or clear what is on screen. next and previous work for songs and scripture alike. lock stops anything changing the screen.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["next", "previous", "clear_words", "clear_all", "lock", "unlock"] } }, required: ["command"] },
        run: async ({ command }) => {
            if (command === "lock" || command === "unlock") {
                outLocked.set(command === "lock")
                return liveState()
            }
            requireUnlocked()
            if (command === "next" || command === "previous") stepScreen(command)
            else if (command === "clear_words") clearSlide()
            else if (command === "clear_all") clearAll(true)
            else throw new ToolError(`Unknown command "${command}".`)
            await settle(900)
            return liveState()
        }
    },
    {
        name: "list_plans",
        description: "Service plans, with what is in each.",
        inputSchema: none,
        readOnly: true,
        run: () =>
            Object.entries(get(projects))
                .filter(([, plan]) => plan && !plan.deleted && !plan.archived)
                .map(([id, plan]) => ({ id, name: plan.name, open: id === get(activeProject), items: (plan.shows || []).map((item) => ({ id: item.id, type: item.type || "show", name: item.name || get(shows)[item.id]?.name || "" })) }))
    },
    {
        name: "create_plan",
        description: 'Create a service plan, such as "Sunday 30 November", and open it.',
        inputSchema: { type: "object", properties: { name: text("Name") }, required: ["name"] },
        run: ({ name }) => {
            if (!String(name).trim()) throw new ToolError("A plan needs a name.")
            const id = uid()
            createProject({ name: String(name).trim(), id })
            if (!get(projects)[id]) throw new ToolError("The plan could not be created.")
            activeProject.set(id)
            return { id, name }
        }
    },
    {
        name: "add_to_plan",
        description: "Add a song or presentation to a service plan.",
        inputSchema: { type: "object", properties: { plan: text("Plan name or id"), song: text("Song name or id") }, required: ["plan", "song"] },
        run: ({ plan, song }) => {
            const target = findByName(get(projects), plan)
            const found = findByName(get(shows), song)
            addToProject({ projectId: target.id, id: found.id })
            return { plan: target.name, added: found.name, items: get(projects)[target.id].shows.length }
        }
    },
    {
        name: "speaker_timer",
        description: "The speaker's countdown: start the program, go to its next segment, or play and pause it.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["start", "next", "play_pause"] } }, required: ["command"] },
        run: ({ command }) => {
            if (command === "start") startProgram()
            else if (command === "next") nextProgramSegment()
            else if (command === "play_pause") playPauseSpeaker()
            else throw new ToolError(`Unknown command "${command}".`)
            return "Done."
        }
    },
    {
        name: "show_media",
        description: "Show a media file by path.",
        inputSchema: { type: "object", properties: { path: text("File path") }, required: ["path"] },
        internal: true,
        run: ({ path }) => {
            requireUnlocked()
            playMedia({ path: String(path) })
            return "Shown."
        }
    }
]

export const listAgentTools = () => agentTools.filter((tool) => !tool.internal).map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly: !!readOnly }))

/** runs a tool; an answer is always { ok, ... } so a caller never has to catch */
export async function runAgentTool(name: string, args: any): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const tool = agentTools.find((t) => t.name === name)
    if (!tool) return { ok: false, error: `There is no tool called "${name}".` }
    const given = args && typeof args === "object" && !Array.isArray(args) ? args : {}
    for (const key of tool.inputSchema.required || []) {
        if (given[key] === undefined || given[key] === null || given[key] === "") return { ok: false, error: `${name} needs "${key}".` }
    }
    for (const [key, value] of Object.entries(given)) {
        const expected = tool.inputSchema.properties[key]
        if (!expected || value === null) continue
        const right = expected.type === "integer" ? Number.isInteger(Number(value)) : typeof value === expected.type
        if (!right) return { ok: false, error: `"${key}" should be a ${expected.type}.` }
        if (expected.enum && !expected.enum.includes(value)) return { ok: false, error: `"${key}" should be one of: ${expected.enum.join(", ")}.` }
    }
    try {
        return { ok: true, result: (await tool.run(given)) ?? "Done." }
    } catch (err) {
        if (!(err instanceof ToolError)) console.error(`Agent tool ${name} failed:`, err)
        return { ok: false, error: err instanceof ToolError ? err.message : "That did not work in the app." }
    }
}
