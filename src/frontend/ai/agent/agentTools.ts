// What an agent can do in the app. One list, used by the chat inside the app and
// by outside agents through the app's own MCP server (src/electron/agent). Every
// tool checks what it was given and says plainly what happened. Nothing here deletes a
// song, a plan or a file; remove_from_plan only takes an item off a plan.

import { get } from "svelte/store"
import { uid } from "uid"
import { activePage, activeProject, activeTimers, aiSuggestions, audioChannelsData, drawerTabsData, outLocked, outputs, overlays, paintCache, playingAudio, projects, scriptures, shows, showsCache, styles, sttTranscript, timers, ai } from "../../stores"
import { API_ACTIONS } from "../../components/actions/api"
import { addToProject, createProject, getClearedState, getPlainText, playMedia, toggleSttListening } from "../../components/actions/apiHelper"
import { getShortBibleName } from "../../components/drawer/bible/scripture"
import { clearAudio } from "../../audio/audioFading"
import { getOutputSlideText } from "../../components/actions/apiGet"
import { getFirstActiveOutput, getOutputResolution, setOutput, toggleOutputs } from "../../components/helpers/output"
import { setPaintLines } from "../../components/draw/paintLines"
import { cleanUp, illustrate, MAX_SHAPES, toStrokes } from "./illustration"
import { loadShows } from "../../components/helpers/setShow"
import { getLayoutRef } from "../../components/helpers/show"
import { clearAll, clearBackground, clearOverlays, clearSlide, restoreOutput } from "../../components/output/clear"
import { addSpeakerTime, nextProgramSegment, playPauseSpeaker, setSpeakerDuration, startProgram } from "../../components/drawer/timers/speakerTimerActions"
import { SPEAKER_TIMER_ID } from "../../components/drawer/timers/speakerTimer"
import { convertText } from "../../converters/txt"
import { ANON_KEY, FUNCTIONS_URL } from "../../scriptural/connection"
import { setActiveScripture } from "../../converters/bible"
import { copilotListening } from "../liveCopilot"
import { AiManager } from "../manager/AiManager"
import { stepScreen } from "./stepScreen"
import { onScreenTitle } from "../components/floating/onScreen"
import { openProject } from "../../components/show/project"
import { readPassage } from "../scripture/passage"
import { findSongsByLine, liveShowId, showSection } from "../songs/librarySongs"
import { matchTitle, PAGES } from "../voice/matthias"
import { matchVersion } from "../voice/versions"
import { isHeld, setAgentMode } from "./control"
import { listFromPoints } from "./listFromPoints"
import { passageShow } from "./planPassage"
import { liveTools } from "./liveTools"
import { mediaList } from "./mediaLibrary"
import { openPage } from "./openPage"
import { nextPlanItem, planItems, removeFromOpenPlan, showPlanItem } from "./planItems"
import { currentScripture, presentPassage } from "./presentPassage"
import { confirm, requireUnlocked, settle, text, ToolError, until } from "./toolBasics"

export interface AgentTool {
    name: string
    description: string
    inputSchema: { type: "object"; properties: Record<string, any>; required?: string[] }
    readOnly?: boolean
    /** may take something away (clears the screen, removes a plan item): outside agents should ask first */
    destructive?: boolean
    /** changes what the room sees, so not while the operator is moving the screen */
    screen?: boolean
    /** not offered to the in-app chat or listed to outside agents: used by the app's own server */
    internal?: boolean
    run: (args: any) => Promise<unknown> | unknown
}

export { ToolError }

const none = { type: "object" as const, properties: {} }

/** saving a song or list opens it for the operator; Matthias adds quietly, so their page stays put */
function addQuietly<T>(add: () => T): T {
    const page = get(activePage)
    try {
        return add()
    } finally {
        if (get(activePage) !== page) activePage.set(page)
    }
}

const NOT_ON_SCREEN = "It did not reach the screen. Check that a screen is switched on."
const liveOut = () => getFirstActiveOutput()?.out
const snapshot = () => JSON.stringify(liveOut() || {})

export function liveState() {
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
        slide?.id === "temp" || slide?.id === "tempText"
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
        copilot: { on: !!get(ai).enabled, listening: get(copilotListening), agentMode: !!get(ai).matthias?.agentMode, operatorHasScreen: isHeld() }
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

/** whether a plan item's own thing is what is up now */
function planItemIsUp(item: { id: string; type?: string }): boolean {
    const type = item.type || "show"
    if (type === "show" || type === "pdf") return liveOut()?.slide?.id === item.id
    if (type === "image" || type === "video") return liveOut()?.background?.path === item.id
    if (type === "overlay") return !!liveOut()?.overlays?.includes(item.id)
    if (type === "audio") return !!get(playingAudio)[item.id]
    return true
}

/** the church's Bible a version name means */
function bibleNamed(name: string): { id: string; label: string } {
    const list = Object.entries(get(scriptures)).map(([id, s]) => ({ id, names: [s?.name, s?.customName, (s as any)?.scripturalVersion, (s as any)?.abbreviation, getShortBibleName(s?.name || "")].filter(Boolean) as string[] }))
    const id = matchVersion(name, list)
    if (!id) throw new ToolError(`There is no ${name.toUpperCase()} Bible here`)
    return { id, label: get(scriptures)[id]?.customName || get(scriptures)[id]?.name || name }
}

/** opens a version for what is shown next, without putting anything up again */
export function openVersion(name: string): string {
    const { id, label } = bibleNamed(name)
    setActiveScripture(id)
    return label
}

/** the church's own: an overlay named for it, else a picture */
async function showLogo() {
    const overlay = matchTitle(
        "logo",
        Object.entries(get(overlays)).map(([id, item]) => ({ id, name: item?.name || "" }))
    )
    if (overlay) {
        if (!liveOut()?.overlays?.includes(overlay.id)) setOutput("overlays", overlay.id, true)
        return confirm(() => !!liveOut()?.overlays?.includes(overlay.id), NOT_ON_SCREEN)
    }
    const picture = matchTitle("logo", mediaList())
    if (!picture) throw new ToolError("There is no logo yet. Make an overlay or add a picture with Logo in its name.")
    playMedia({ path: picture.id })
    return confirm(() => liveOut()?.background?.path === picture.id || liveOut()?.slide?.id === picture.id, NOT_ON_SCREEN)
}

/** the new version's name; what is on screen changes with it */
export async function changeVersion(name: string): Promise<string> {
    const { id, label } = bibleNamed(name)
    const { reference } = currentScripture()
    const chapter = reference?.chapters?.[reference.chapters.length - 1]
    const verses = reference?.verses?.[reference.verses.length - 1] || []
    const up = getFirstActiveOutput()?.out?.slide?.id === "temp"
    if (reference?.book && chapter && verses.length && up) {
        requireUnlocked()
        if (!(await presentPassage(`${reference.book}.${chapter}.${verses.join(",")}`, id))) throw new ToolError(`The passage could not be put up in ${label}.`)
    } else setActiveScripture(id)
    return label
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
        screen: true,
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
            await confirm(() => get(copilotListening) === !!on, on ? "Listening did not start. Check the microphone in Settings, Live Copilot." : "Listening did not stop.", 8000)
            return { listening: get(copilotListening) }
        }
    },
    {
        name: "set_agent_mode",
        destructive: true,
        description: "Let the app lead the screen by itself from what it hears (scripture, songs, clearing up), or hand it back to the operator.",
        inputSchema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
        run: ({ on }) => {
            if (!setAgentMode(!!on)) throw new ToolError('Agent mode is not on yet. The operator has been asked: they press "Turn on" in the Matthias panel.')
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
        description: "Put a passage on screen in the church's open Bible, or in the version named, which then stays open.",
        inputSchema: { type: "object", properties: { reference: text('Such as "John 3:16" or "Romans 8:28-30"'), version: text("Such as KJV or New Living Translation; the open Bible when left out") }, required: ["reference"] },
        screen: true,
        run: async ({ reference, version }) => {
            requireUnlocked()
            const bible = version ? bibleNamed(String(version)) : null
            const passage = await readPassage(String(reference), bible?.id)
            if (!passage) throw new ToolError(`${reference} was not found in the open Bible. Check the reference, or open a Bible in the Scripture drawer.`)
            if (bible) setActiveScripture(bible.id)
            const before = JSON.stringify(getFirstActiveOutput()?.out?.slide || null)
            // the same way Matthias shows it, so "bring it back" knows about it (it goes through presentPassage)
            try {
                await AiManager.showReference(String(reference))
            } catch (err) {
                console.warn("show_scripture:", err)
                throw new ToolError("The passage did not reach the screen. Check that a screen is switched on.")
            }
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
        name: "find_song_by_words",
        description: 'Find songs by a line someone remembers from the words ("how sweet the sound"). Shows nothing: offer the matches, and use present_song only when asked.',
        inputSchema: { type: "object", properties: { line: text("Three or more words from the song") }, required: ["line"] },
        readOnly: true,
        run: ({ line }) => {
            if (String(line).trim().split(/\s+/).length < 3) throw new ToolError("Say more of the line, three words or more.")
            const found = findSongsByLine(String(line))
            if (!found.length) throw new ToolError(`No song in the library has "${line}".`)
            return { songs: found.map(({ id, name, share }) => ({ id, name, match: share >= 0.6 ? "strong" : "weak" })), next: "Nothing was put on screen. Use present_song with the id of the one that is wanted." }
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
            const { id } = addQuietly(() => convertText({ name, text: String(lyrics), category: "song", noFormatting: true, open: false }))
            return { added: name, id }
        }
    },
    {
        name: "present_song",
        description: "Put a song or presentation on screen, from its first slide or a given one.",
        inputSchema: { type: "object", properties: { name: text("Name or id"), slide: { type: "integer", description: "Slide number, from 1" } }, required: ["name"] },
        screen: true,
        run: async ({ name, slide }) => {
            requireUnlocked()
            const found = findByName(get(shows), name)
            await loadShows([found.id])
            const total = getLayoutRef(found.id).length
            const index = Math.max(1, Number(slide) || 1) - 1
            if (index >= total) throw new ToolError(`"${found.name}" has ${total} slide${total === 1 ? "" : "s"}.`)
            await AiManager.showSong(found, index)
            if (!(await until(() => getFirstActiveOutput()?.out?.slide?.id === found.id, 3000))) throw new ToolError("It did not reach the screen. Check that a screen is switched on.")
            return liveState().showing
        }
    },
    {
        name: "draw_on_screen",
        description: `Draw a simple illustration over what is on screen, such as a cross, a path, a bridge or a flow of arrows for what is being preached. Coordinates are on a 0-100 grid (0,0 top left; 100,100 bottom right). Shapes: {"type":"line"|"arrow"|"path","points":[[x,y],...]}, {"type":"circle","x","y","r"}, {"type":"rect","x","y","w","h"}; each may have "color" (hex such as #ffffff) and "size" (pen width, 0.3-6). At most ${MAX_SHAPES} shapes. Keep it simple and readable from the back of the room. Set replace to false to add to the drawing already there.`,
        inputSchema: { type: "object", properties: { shapes: { type: "array", items: { type: "object" }, description: "The shapes to draw" }, replace: { type: "boolean", description: "Start a new drawing (default true)" } }, required: ["shapes"] },
        screen: true,
        run: ({ shapes, replace }) => {
            requireUnlocked()
            const outputId = getFirstActiveOutput()?.id || ""
            const { lines, drawn, skipped } = illustrate(shapes, getOutputResolution(outputId, get(outputs), true, "", get(styles)))
            if (!drawn) throw new ToolError("None of those shapes could be drawn. Each needs numbers on the 0-100 grid; a line needs at least two points.")
            setPaintLines(replace === false ? [...get(paintCache), ...lines] : lines)
            return { drawn, ...(skipped ? { skipped } : {}), tip: "Say clean up the drawing to tidy it, or clear the drawing to remove it." }
        }
    },
    {
        name: "clean_up_drawing",
        description: "Tidy the drawing on screen, whether the operator drew it by hand or Matthias did: wobble taken out, straight lines made straight, circles made round. Colours stay.",
        inputSchema: none,
        screen: true,
        run: () => {
            requireUnlocked()
            const current = get(paintCache)
            if (!toStrokes(current).length) throw new ToolError("There is no drawing to clean up.")
            const outputId = getFirstActiveOutput()?.id || ""
            setPaintLines(cleanUp(current, getOutputResolution(outputId, get(outputs), true, "", get(styles))))
            return { strokes: toStrokes(get(paintCache)).length }
        }
    },
    {
        name: "clear_drawing",
        destructive: true,
        description: "Remove the drawing from the screen.",
        inputSchema: none,
        screen: true,
        run: () => {
            requireUnlocked()
            setPaintLines([])
            return "Drawing cleared."
        }
    },
    {
        name: "make_list",
        description: "Turn the main points of what was said into a list slide in the library, ready to show. Give a short title and 2 to 8 short points in the speaker's own words. It is saved as a presentation, and nothing goes on screen until present_song is used with its name.",
        inputSchema: { type: "object", properties: { title: text("Short title"), points: { type: "array", items: { type: "string" }, description: "The points, each a few words" } }, required: ["title", "points"] },
        run: ({ title, points }) => {
            const list = listFromPoints(String(title), points)
            if ("error" in list) throw new ToolError(list.error)
            const existing = Object.values(get(shows)).find((show) => show?.name?.trim().toLowerCase() === list.title.toLowerCase())
            if (existing) throw new ToolError(`"${existing.name}" is already in the library. Pick another title, or show that one.`)
            const { id } = addQuietly(() => convertText({ name: list.title, text: list.text, category: null, noFormatting: true, open: false }))
            return { made: list.title, id, points: list.count, next: "Use present_song with this name to put it on screen." }
        }
    },
    {
        name: "control_screen",
        destructive: true,
        description: "Move or clear what is on screen. next and previous work for songs and scripture alike. restore brings back what clear_all took off. black covers the screen in true black, whatever the style shows, until clear_words takes it off; logo puts up the church's logo (an overlay or picture named Logo). screen_on and screen_off switch the projector window. lock stops anything changing the screen; only the operator can unlock it.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["next", "previous", "clear_words", "clear_background", "clear_overlays", "clear_all", "black", "logo", "restore", "screen_on", "screen_off", "lock"] } }, required: ["command"] },
        screen: true,
        run: async ({ command }) => {
            // an agent may lock the screen, never unlock it: a lock is the operator's word
            if (command === "lock") {
                outLocked.set(true)
                return liveState()
            }
            requireUnlocked()
            if (command === "next" || command === "previous") {
                const before = snapshot()
                const stuck = `Nothing moved. This may be the ${command === "next" ? "last" : "first"} one, or no screen is switched on.`
                if (!(await stepScreen(command))) throw new ToolError(stuck)
                await confirm(() => snapshot() !== before, stuck)
            } else if (command === "clear_words") clearSlide()
            else if (command === "clear_background") clearBackground()
            else if (command === "clear_overlays") clearOverlays()
            else if (command === "clear_all") clearAll(true)
            else if (command === "black") {
                // the black covers the background, which stays under it for when the black comes off;
                // overlays sit above, so they go
                clearOverlays()
                const { width, height } = getOutputResolution(getFirstActiveOutput()?.id || "", get(outputs), true, "", get(styles))
                // a box of its own, so no style background or colour shows through
                setOutput("slide", { id: "tempText", name: "Black screen", tempItems: [{ type: "text", style: `left:0px;top:0px;width:${width}px;height:${height}px;background-color: #000000;`, lines: [{ align: "", text: [{ value: "", style: "" }] }] }] })
                await confirm(() => liveOut()?.slide?.id === "tempText", NOT_ON_SCREEN)
            } else if (command === "logo") await showLogo()
            else if (command === "restore") restoreOutput()
            else if (command === "screen_on" || command === "screen_off") toggleOutputs(null, { state: command === "screen_on" })
            else throw new ToolError(`Unknown command "${command}".`)
            if (command === "clear_words") await confirm(() => !liveOut()?.slide, "The words are still on screen.")
            else if (command === "clear_background") await confirm(() => !liveOut()?.background, "The background is still on screen.")
            else if (command === "restore") await confirm(() => !getClearedState().all, "There is nothing to bring back.")
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
        description: "Add songs or presentations, a Bible passage, a picture or video, or an overlay (such as a logo) to a service plan, in that order. Call it again for another order.",
        inputSchema: {
            type: "object",
            properties: { plan: text("Plan name or id"), song: text("One song, by name or id"), songs: { type: "array", items: { type: "string" }, description: "Several songs, by name or id" }, scripture: text('A passage, such as "John 3:16"; it is saved as slides'), version: text("The Bible for the passage; the open one when left out"), media: text("A picture or video, by name"), overlay: text("An overlay, by name or id") },
            required: ["plan"]
        },
        run: async ({ plan, song, songs, scripture, version, media, overlay }) => {
            const target = findByName(get(projects), plan)
            const wanted: string[] = [...(song ? [song] : []), ...(songs || [])].map(String)
            if (!wanted.length && !scripture && !media && !overlay) throw new ToolError("Say what to add: a song, a passage, a picture or video, or an overlay.")
            const added: string[] = []
            const notAdded: string[] = []
            const add = async (name: string, find: () => Promise<{ name: string; id: string; data?: object }> | { name: string; id: string; data?: object }) => {
                try {
                    const { name: label, ...item } = await find()
                    addToProject({ projectId: target.id, ...item })
                    added.push(label)
                } catch (err) {
                    notAdded.push(err instanceof ToolError ? err.message : name)
                }
            }
            for (const name of wanted) await add(name, () => findByName(get(shows), name))
            if (scripture)
                await add(String(scripture), async () => {
                    const open = get(drawerTabsData).scripture?.activeSubTab || ""
                    const tab = version ? bibleNamed(String(version)).id : get(scriptures)[open] ? open : Object.keys(get(scriptures))[0] || ""
                    const show = tab ? await passageShow(String(scripture), tab) : null
                    if (!show) throw new ToolError(`${scripture} was not found. Check the reference, or open a Bible in the Scripture drawer.`)
                    return show
                })
            if (media)
                await add(String(media), () => {
                    const list = mediaList()
                    const item = list.find((entry) => entry.id === media) || matchTitle(String(media), list)
                    if (!item) throw new ToolError(`No picture or video named "${media}" was found.`)
                    return { name: item.name, id: item.id, data: { type: item.kind, name: item.name } }
                })
            if (overlay)
                await add(String(overlay), () => {
                    const found = findByName(get(overlays) as any, overlay)
                    return { name: found.name, id: found.id, data: { type: "overlay", name: found.name } }
                })
            if (!added.length) throw new ToolError(notAdded.join(" "))
            return { plan: target.name, added, ...(notAdded.length ? { notAdded } : {}), items: get(projects)[target.id].shows.length }
        }
    },
    {
        name: "remove_from_plan",
        destructive: true,
        description: "Take one item off the open service plan. The song stays in the library, and the operator can undo it with Ctrl+Z. Nothing else is ever deleted.",
        inputSchema: { type: "object", properties: { item: text("The item's name") }, required: ["item"] },
        run: ({ item }) => {
            const result = removeFromOpenPlan(String(item))
            if ("error" in result) throw new ToolError(result.error)
            return { ...result, undo: "Ctrl+Z in the app brings it back" }
        }
    },
    {
        name: "open_plan",
        description: "Open a service plan for the operator.",
        inputSchema: { type: "object", properties: { plan: text("Plan name or id") }, required: ["plan"] },
        run: ({ plan }) => {
            const found = findByName(get(projects), plan)
            openProject(found.id, false)
            return { open: found.name, items: planItems().map((item) => item.label) }
        }
    },
    {
        name: "show_plan_item",
        description: 'Put an item of the open plan on screen: "start" for the first, "next", "previous", or its name.',
        inputSchema: { type: "object", properties: { item: text("start, next, previous, or the item's name") }, required: ["item"] },
        screen: true,
        run: async ({ item }) => {
            requireUnlocked()
            const items = planItems()
            if (!items.length) throw new ToolError("No plan is open, or it has nothing in it.")
            const wanted = String(item).trim().toLowerCase()
            const found = wanted === "start" || wanted === "next" || wanted === "previous" ? nextPlanItem(wanted) : items[items.findIndex((i) => i.label.toLowerCase() === wanted)]
            if (!found) throw new ToolError(wanted === "next" ? "That was the last item." : `The plan has: ${items.map((i) => i.label).join("; ")}.`)
            await showPlanItem(found)
            await confirm(() => planItemIsUp(found), NOT_ON_SCREEN)
            await settle(900)
            return { shown: found.label, next: nextPlanItem("next")?.label || null }
        }
    },
    {
        name: "show_section",
        description: "Go to a part of the song that is on screen: chorus, bridge, verse 2.",
        inputSchema: { type: "object", properties: { section: text("chorus, verse, bridge, tag, intro, outro"), number: { type: "integer", description: "Which one, from 1" } }, required: ["section"] },
        screen: true,
        run: async ({ section, number }) => {
            requireUnlocked()
            if (!liveShowId() || liveShowId() === "temp") throw new ToolError("No song is on screen.")
            const shown = await showSection(String(section), number ? Number(number) : undefined)
            if (!shown) throw new ToolError(`The song has no ${section}${number ? ` ${number}` : ""}.`)
            return { shown }
        }
    },
    {
        name: "set_bible_version",
        description: "Change the church's open Bible version. The passage on screen changes with it.",
        inputSchema: { type: "object", properties: { version: text("Such as KJV, NLT or New Living Translation") }, required: ["version"] },
        screen: true,
        run: async ({ version }) => {
            const label = await changeVersion(String(version))
            return { version: label }
        }
    },
    {
        name: "show_overlay",
        description: "Put one of the church's overlays (a logo, a notice, a timer) on screen, or take it off. Leave name out to list them.",
        inputSchema: { type: "object", properties: { name: text("Overlay name or id"), on: { type: "boolean" } } },
        screen: true,
        run: async ({ name, on }) => {
            if (!name) return { overlays: Object.values(get(overlays)).map((overlay) => overlay.name) }
            requireUnlocked()
            const found = findByName(get(overlays) as any, name)
            const showing = (getFirstActiveOutput()?.out?.overlays || []).includes(found.id)
            if (showing !== (on !== false)) setOutput("overlays", found.id, true)
            await confirm(() => !!liveOut()?.overlays?.includes(found.id) === (on !== false), NOT_ON_SCREEN)
            return { overlay: found.name, on: on !== false }
        }
    },
    {
        name: "show_picture_or_video",
        description: "Put one of the church's pictures or videos on screen by name. Leave name out to list them.",
        inputSchema: { type: "object", properties: { name: text("Its name") } },
        screen: true,
        run: async ({ name }) => {
            const list = mediaList()
            if (!name) return { media: list.slice(0, 100).map(({ name, kind }) => ({ name, kind })) }
            requireUnlocked()
            const item = list.find((media) => media.id === name) || matchTitle(String(name), list)
            if (!item) throw new ToolError(`Nothing named "${name}" was found.`)
            playMedia({ path: item.id })
            await confirm(() => liveOut()?.background?.path === item.id || liveOut()?.slide?.id === item.id, NOT_ON_SCREEN)
            return { shown: item.name }
        }
    },
    {
        name: "control_sound",
        description: "The sound the app is playing: stop it, mute and unmute it, or change the main volume.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["stop", "mute", "unmute", "louder", "quieter", "set_volume"] }, percent: { type: "number", description: "For set_volume, 0 to 100" } }, required: ["command"] },
        run: async ({ command, percent }) => {
            if (command === "louder" || command === "quieter" || command === "set_volume") {
                if (command === "set_volume" && !(Number(percent) >= 0 && Number(percent) <= 100 && percent !== undefined)) throw new ToolError("Say how loud, from 0 to 100 percent.")
                const now = Math.round((get(audioChannelsData).main?.volume ?? 1) * 100)
                const wanted = Math.min(100, Math.max(0, command === "set_volume" ? Math.round(Number(percent)) : now + (command === "louder" ? 10 : -10)))
                API_ACTIONS.change_volume({ volume: wanted / 100 })
                return { volume: `${wanted} percent` }
            }
            if (command === "stop") {
                clearAudio("", { clearPlaylist: true, commonClear: true })
                // the music fades out; microphones are left alone
                await confirm(() => !Object.values(get(playingAudio)).some((audio: any) => !audio?.isMic), "The sound is still playing.", 6000)
            } else audioChannelsData.update((a) => ({ ...a, main: { ...(a.main || {}), isMuted: command === "mute" } }))
            return "Done."
        }
    },
    {
        name: "open_page",
        description: "Take the operator to a page or a library tab of the app. Changes nothing on screen.",
        inputSchema: { type: "object", properties: { page: { type: "string", enum: [...PAGES] } }, required: ["page"] },
        run: ({ page }) => {
            openPage(page)
            return { open: page }
        }
    },
    {
        name: "speaker_timer",
        description: "The speaker's countdown: start the program, go to its next segment, play and pause it, set it to a number of minutes and start it, or add minutes.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["start", "next", "play_pause", "set", "add"] }, minutes: { type: "number", description: "For set and add; 0.5 is thirty seconds" } }, required: ["command"] },
        run: ({ command, minutes }) => {
            if ((command === "set" || command === "add") && !(Number(minutes) > 0)) throw new ToolError("Say how many minutes.")
            const running = () => get(activeTimers).some((timer) => timer.id === SPEAKER_TIMER_ID)
            const needsProgram = () => {
                if (!get(timers)[SPEAKER_TIMER_ID]?.program?.segments?.length) throw new ToolError("There is no speaker program yet. Add one in the Timers drawer, or say how many minutes.")
            }
            if (command === "add") {
                if (!get(timers)[SPEAKER_TIMER_ID]) throw new ToolError("No speaker timer is set. Say how many minutes to set it to.")
                addSpeakerTime(Number(minutes) * 60)
                return "Done."
            }
            if (command === "set") {
                setSpeakerDuration(Number(minutes) * 60)
                playPauseSpeaker()
            } else if (command === "start" || command === "next") {
                needsProgram()
                if (command === "start") startProgram()
                else nextProgramSegment()
            } else if (command === "play_pause") playPauseSpeaker()
            else throw new ToolError(`Unknown command "${command}".`)
            // "next" after the last part stops the timer, which is right
            if (command !== "next" && !running()) throw new ToolError("The speaker timer did not start.")
            return "Done."
        }
    },
    ...liveTools,
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

export const listAgentTools = () => agentTools.filter((tool) => !tool.internal).map(({ name, description, inputSchema, readOnly, destructive }) => ({ name, description, inputSchema, readOnly: !!readOnly, destructive: !!destructive }))

export const changesScreen = (name: string) => !!agentTools.find((tool) => tool.name === name)?.screen

/** runs a tool; an answer is always { ok, ... } so a caller never has to catch.
 * Internal tools are for the app's own MCP server only (allowInternal), never a model's pick. */
export async function runAgentTool(name: string, args: any, allowInternal = false): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const tool = agentTools.find((t) => t.name === name && (allowInternal || !t.internal))
    if (!tool) return { ok: false, error: `There is no tool called "${name}".` }
    const given = args && typeof args === "object" && !Array.isArray(args) ? args : {}
    for (const key of tool.inputSchema.required || []) {
        if (given[key] === undefined || given[key] === null || given[key] === "") return { ok: false, error: `${name} needs "${key}".` }
    }
    for (const [key, value] of Object.entries(given)) {
        const expected = tool.inputSchema.properties[key]
        if (!expected || value === null) continue
        const right = expected.type === "array" ? Array.isArray(value) : expected.type === "integer" ? Number.isInteger(Number(value)) : expected.type === "number" ? Number.isFinite(Number(value)) : typeof value === expected.type
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
