import { beforeEach, expect, it, vi } from "vitest"

vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { activeProject: writable("p"), ai: writable({}), aiSuggestions: writable([]), audioChannelsData: writable({}), outLocked: writable(false), overlays: writable({ l: { name: "Logo" } }), projects: writable({ p: { name: "Sunday", shows: [] } }), shows: writable({ a: { name: "Amazing Grace" } }), sttTranscript: writable({ finalized: "", unprocessed: "" }) }
})
vi.mock("../../components/actions/apiHelper", () => ({ addToProject: vi.fn(), removeProjectItem: vi.fn(), playMedia: vi.fn(), toggleSttListening: vi.fn() }))
const screen = vi.hoisted(() => ({ slide: { id: "temp" } as { id: string } | null }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => ({ out: { slide: screen.slide } }), setOutput: vi.fn(), toggleOutputs: vi.fn() }))
vi.mock("../../audio/audioFading", () => ({ clearAudio: vi.fn() }))
vi.mock("../agent/mediaLibrary", () => ({ mediaList: () => [{ id: "/v/welcome.mp4", name: "welcome", kind: "video" }] }))
vi.mock("../../components/output/clear", () => ({ clearBackground: vi.fn(), clearOverlays: vi.fn() }))
vi.mock("../../components/drawer/timers/speakerTimerActions", () => ({ addSpeakerTime: vi.fn(), nextProgramSegment: vi.fn(), setSpeakerDuration: vi.fn(), playPauseSpeaker: vi.fn(), startProgram: vi.fn() }))
vi.mock("../../components/show/project", () => ({ openProject: vi.fn() }))
const chat = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock("../agent/agentChat", () => ({ agentInstructions: () => "", runAgentChat: chat.run }))
vi.mock("../agent/agentTools", () => ({ changesScreen: (t: string) => t === "show_scripture", changeVersion: vi.fn(async () => "NLT"), openVersion: vi.fn(() => "NLT"), liveState: () => ({ nothingOnScreen: true }), runAgentTool: vi.fn(async (name: string) => ({ ok: true, result: name === "remove_from_plan" ? { plan: "Sunday", removed: "Amazing Grace" } : {} })), searchBible: vi.fn(async () => [{ reference: "Philippians 4:6" }, { reference: "Matthew 6:25" }]), ToolError: class extends Error {} }))
const lead = vi.hoisted(() => ({ confirmed: true }))
vi.mock("../agent/control", async () => {
    const { writable } = await import("svelte/store")
    const { ai } = await import("../../stores")
    return {
        handMoves: writable(0),
        setAgentMode: (on: boolean) => {
            if (on && !lead.confirmed) return false
            ai.update((a) => ({ ...a, matthias: { ...a.matthias, agentMode: on } }))
            return true
        }
    }
})
vi.mock("../agent/openPage", () => ({ openPage: vi.fn() }))
vi.mock("../agent/planItems", () => ({ nextPlanItem: vi.fn(() => ({ id: "a", label: "Amazing Grace" })), removeFromOpenPlan: vi.fn(() => ({ plan: "Sunday", removed: "Amazing Grace" })), showPlanItem: vi.fn() }))
vi.mock("../agent/stepScreen", () => ({ stepScreen: vi.fn() }))
const model = vi.hoisted(() => ({ llm: null as any }))
vi.mock("../llm/llmManager", () => ({ addChatMessage: vi.fn(), clearChatHistory: vi.fn(), getChatHistory: () => [], getLLMManager: () => model.llm }))
vi.mock("../llm/prompts", () => ({ CHAT_RESPONSE_SCHEMA: {}, CHAT_SYSTEM_PROMPT: "" }))
vi.mock("../songs/librarySongs", () => ({ showSection: vi.fn(async () => "Chorus"), showSlide: vi.fn(async () => 2) }))
const manager = vi.hoisted(() => ({ showReference: vi.fn(), showSong: vi.fn(), findReference: vi.fn(async (w: string) => (/john/i.test(w) ? "John 3:16" : null)), navigateNow: vi.fn(async () => "John 3:17"), clearScreen: vi.fn(), undoChange: vi.fn(() => true), showAgain: vi.fn(async () => "John 3:16"), asOwnChange: vi.fn((_c: string, f: () => unknown) => f()) }))
vi.mock("../manager/AiManager", () => ({ AiManager: manager }))

import { get } from "svelte/store"
import { ai, aiSuggestions, outLocked } from "../../stores"
import { handMoves } from "../agent/control"
import { openVersion, runAgentTool } from "../agent/agentTools"
import { stepScreen } from "../agent/stepScreen"
import { addChatMessage, clearChatHistory } from "../llm/llmManager"
import { planProblem } from "../../scriptural/planNotice"
import { Matthias, matthiasStatus } from "./matthiasAgent"

let position = 0
beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    ai.set({})
    outLocked.set(false)
    vi.mocked(runAgentTool).mockImplementation(async (name) => ({ ok: true, result: name === "remove_from_plan" ? { plan: "Sunday", removed: "Amazing Grace" } : {} }))
    model.llm = null
    screen.slide = { id: "temp" }
    Matthias.stop()
    position += 2000
})
// each test is a new stretch of one long transcript
const hear = (words: string, ended = false) => Matthias.hear(words, position, ended)
const settle = () => vi.advanceTimersByTimeAsync(10_000)

it("waits for the request to be finished, then does it once", async () => {
    expect(hear("so the love of God is real. matthias show")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(hear("so the love of God is real. matthias show john three")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(manager.showReference).not.toHaveBeenCalled()
    hear("so the love of God is real. Matthias, show John three sixteen.", true)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
    // the same words, heard again as the transcript grows
    expect(hear("so the love of God is real. Matthias, show John three sixteen. And we know")).toBe(false)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
})

it("does one request after another", async () => {
    hear("matthias next verse", true)
    await settle()
    hear("matthias next verse and the light. matthias clear the screen", true)
    await settle()
    expect(manager.navigateNow).toHaveBeenCalledTimes(1)
    expect(manager.clearScreen).toHaveBeenCalledTimes(1)
})

it("searches, shows the best, and moves to another", async () => {
    await Matthias.ask("find the verse about being anxious")
    expect(manager.showReference).toHaveBeenLastCalledWith("Philippians 4:6")
    await Matthias.ask("another one")
    expect(manager.showReference).toHaveBeenLastCalledWith("Matthew 6:25")
})

it("offers the songs that have a remembered line, and shows none by itself", async () => {
    vi.mocked(runAgentTool).mockResolvedValueOnce({ ok: true, result: { songs: [{ id: "a", name: "Amazing Grace", match: "weak" }] } })
    await Matthias.ask("find the song that says how sweet the sound")
    expect(runAgentTool).toHaveBeenCalledWith("find_song_by_words", { line: "how sweet the sound" })
    expect(manager.showSong).not.toHaveBeenCalled()
    const [offer] = get(aiSuggestions)
    expect(offer.content).toBe("Amazing Grace")
    offer.trigger?.()
    expect(manager.showSong).toHaveBeenCalledWith({ id: "a", name: "Amazing Grace" })
    expect(get(matthiasStatus)?.text).toMatch(/Amazing Grace/)
})

it("plays a song of the library", async () => {
    await Matthias.ask("sing amazing grace")
    expect(manager.showSong).toHaveBeenCalledWith({ id: "a", name: "Amazing Grace" })
})

it("leaves a locked screen alone", async () => {
    outLocked.set(true)
    await Matthias.ask("show John 3 16")
    expect(manager.showReference).not.toHaveBeenCalled()
    expect(get(matthiasStatus)).toEqual({ state: "failed", text: "The screen is locked" })
})

it("takes and gives back the lead", async () => {
    await Matthias.ask("take over")
    expect(get(ai).matthias?.agentMode).toBe(true)
    await Matthias.ask("stand down")
    expect(get(ai).matthias?.agentMode).toBe(false)
})

it("does not turn agent mode on by itself before the operator has said yes once", async () => {
    lead.confirmed = false
    await Matthias.ask("take over")
    expect(get(ai).matthias?.agentMode).toBeFalsy()
    expect(get(matthiasStatus)?.text).toMatch(/Turn on/)
    lead.confirmed = true
})

it("says nothing when the name was only said in passing, or is switched off", async () => {
    hear("matthias was a faithful man", true)
    await settle()
    expect(get(matthiasStatus)).toBeNull()
    ai.set({ matthias: { name: false } })
    expect(hear("and then matthias next verse", true)).toBe(false)
})

it("does nothing for the name in a sermon, with the ask setting off", async () => {
    const sermon = ["They prayed. Matthias. Next verse", "They prayed, Matthias, next verse", "Peter stood up and Matthias next verse", "Matthias, Acts 1 verse 26, was numbered with the eleven apostles.", "Matthias was numbered with the eleven. Next verse", "So Matthias clear the screen"]
    for (const words of sermon) {
        position += 2000
        hear(words, true)
        await settle()
    }
    expect(manager.showReference).not.toHaveBeenCalled()
    expect(manager.navigateNow).not.toHaveBeenCalled()
    expect(manager.clearScreen).not.toHaveBeenCalled()
    expect(manager.findReference).not.toHaveBeenCalled()
    expect(get(matthiasStatus)).toBeNull()
})

it("does everything asked for in one breath, in order", async () => {
    await Matthias.ask("put up John 3 16 then clear the screen")
    expect(manager.showReference).toHaveBeenCalledWith("John 3:16")
    expect(manager.clearScreen).toHaveBeenCalledTimes(1)
})

it("goes to a part of the song, and takes verse two for the song's when one is up", async () => {
    screen.slide = { id: "a" }
    await Matthias.ask("back to the chorus")
    expect(runAgentTool).toHaveBeenLastCalledWith("show_section", { section: "chorus" })
    await Matthias.ask("go to verse two")
    expect(runAgentTool).toHaveBeenLastCalledWith("show_section", { section: "verse", number: 2 })
})

it("steps several at once", async () => {
    const done = Matthias.ask("go forward three slides")
    await settle()
    await done
    expect(stepScreen).toHaveBeenCalledTimes(3)
})

it("runs the plan and adds to it, and never shows what is only added", async () => {
    await Matthias.ask("next item")
    expect(runAgentTool).toHaveBeenLastCalledWith("show_plan_item", { item: "next" })
    await Matthias.ask("add Amazing Grace to the plan")
    expect(runAgentTool).toHaveBeenLastCalledWith("add_to_plan", { plan: "p", song: "a" })
    expect(manager.showSong).not.toHaveBeenCalled()
})

it("does not put up a passage that is only asked about", async () => {
    await Matthias.ask("who wrote John 3 16", true, true)
    await Matthias.ask("make a plan with John 3 16", true, true)
    expect(manager.showReference).not.toHaveBeenCalled()
})

it("answers a typed request it cannot do without a model, and writes the conversation down", async () => {
    await Matthias.ask("compose a poem", true, true)
    expect(addChatMessage).toHaveBeenNthCalledWith(1, "default", "user", "compose a poem")
    expect(vi.mocked(addChatMessage).mock.calls[1][2]).toMatch(/did not understand/)
})

it("works on one request at a time, and stops at once when told to", async () => {
    model.llm = {}
    let finish: (a: unknown) => void = () => {}
    chat.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const first = Matthias.ask("prepare something long", true, true)
    const second = Matthias.ask("compose another long thing", true, true)
    await vi.advanceTimersByTimeAsync(10)
    expect(chat.run).toHaveBeenCalledTimes(1)
    await Matthias.ask("stand down", true, true)
    expect(get(ai).matthias?.agentMode).toBe(false)
    finish({ content: "All done" })
    await Promise.all([first, second])
    expect(chat.run).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addChatMessage).mock.calls.some((c) => c[2] === "All done")).toBe(false)
})

// a model that only ends when it is told to stop
function hungModel() {
    const request = vi.fn((options: { signal: AbortSignal }) => new Promise<null>((resolve) => options.signal.addEventListener("abort", () => resolve(null))))
    model.llm = { request }
    chat.run.mockImplementationOnce(async (_history, deps) => {
        await deps.ask("prompt", false)
        return deps.stopped() ? { content: "Stopped." } : null
    })
    return request
}

it("does not make a plain command wait behind a model turn, and ends that turn", async () => {
    const request = hungModel()
    const first = Matthias.ask("prepare something long")
    await vi.advanceTimersByTimeAsync(10)
    await Matthias.ask("next verse")
    await first
    expect(manager.navigateNow).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].signal.aborted).toBe(true)
})

it.each([
    ["spoken", false, 45_000],
    ["typed", true, 120_000]
])("gives up on a %s model turn at its deadline", async (_, typed, deadline) => {
    const request = hungModel()
    const turn = Matthias.ask("prepare something long", true, typed)
    await vi.advanceTimersByTimeAsync(deadline - 1000)
    expect(request.mock.calls[0][0].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await turn
    expect(get(matthiasStatus)).toEqual({ state: "failed", text: expect.stringMatching(/took too long/) })
})

it("leaves the screen alone once the operator has moved it, and still does the rest", async () => {
    model.llm = {}
    const refusals: string[] = []
    chat.run.mockImplementationOnce(async (_h, deps) => {
        refusals.push(deps.refuse("show_scripture"))
        handMoves.update((n) => n + 1)
        refusals.push(deps.refuse("show_scripture"), deps.refuse("list_songs"))
        return { content: "Done" }
    })
    await Matthias.ask("prepare something long", true, true)
    expect(refusals).toEqual(["", expect.stringMatching(/operator/), ""])
})

it("takes a song off the plan, and says how to get it back", async () => {
    await Matthias.ask("take Amazing Grace off the plan")
    expect(get(matthiasStatus)?.text).toMatch(/Took Amazing Grace off Sunday.*Ctrl\+Z/)
})

it("does not put up a passage for a sentence that only mentions one", async () => {
    await Matthias.ask("read me the words of Morning Hill without showing them")
    expect(manager.showReference).not.toHaveBeenCalled()
})

it("draws a plain shape, tidies and clears the drawing without a model", async () => {
    vi.mocked(runAgentTool).mockResolvedValue({ ok: true, result: {} })
    await Matthias.ask("draw a cross on the paint board", true, true)
    expect(runAgentTool).toHaveBeenLastCalledWith("draw_on_screen", { shapes: expect.arrayContaining([expect.objectContaining({ type: "line" })]) })
    expect(get(matthiasStatus)?.text).toBe("Drew a cross")
    await Matthias.ask("clean up the drawing", true, true)
    expect(runAgentTool).toHaveBeenLastCalledWith("clean_up_drawing", {})
    await Matthias.ask("clear the drawing", true, true)
    expect(runAgentTool).toHaveBeenLastCalledWith("clear_drawing", {})
})

it("says what a drawing needs when it is not a plain shape and there is no model", async () => {
    await Matthias.ask("Draw what the preacher is describing", true, true)
    expect(vi.mocked(addChatMessage).mock.calls[1][2]).toMatch(/needs an AI model/)
})

it("does not draw on a locked screen, and reports a drawing that failed", async () => {
    outLocked.set(true)
    await Matthias.ask("draw a cross")
    expect(runAgentTool).not.toHaveBeenCalled()
    outLocked.set(false)
    vi.mocked(runAgentTool).mockResolvedValue({ ok: false, error: "There is no drawing to clean up." })
    await Matthias.ask("clean up the drawing")
    expect(get(matthiasStatus)).toEqual({ state: "failed", text: "There is no drawing to clean up." })
})

it("forgets the conversation and stops what is being done when the chat is cleared", () => {
    Matthias.clearChat()
    expect(clearChatHistory).toHaveBeenCalledWith("default")
})

// one implementation of each action, the tools: so what they check is checked when spoken too
it.each([
    ["start the timer", "speaker_timer", { command: "start" }],
    ["next segment", "speaker_timer", { command: "next" }],
    ["set a timer for ten minutes", "speaker_timer", { command: "set", minutes: 10 }],
    ["start a 30 second timer", "speaker_timer", { command: "set", minutes: 0.5 }],
    ["add two minutes", "speaker_timer", { command: "add", minutes: 2 }],
    ["stop the music", "control_sound", { command: "stop" }],
    ["turn the screen off", "control_screen", { command: "screen_off" }],
    ["clear the background", "control_screen", { command: "clear_background" }],
    ["remove the overlay", "control_screen", { command: "clear_overlays" }],
    ["show the logo", "show_overlay", { name: "l", on: true }],
    ["play the welcome video", "show_picture_or_video", { name: "/v/welcome.mp4" }],
    ["open settings", "open_page", { page: "settings" }],
    ["open the plan Sunday", "open_plan", { plan: "p" }]
])('does "%s" with the %s tool', async (words, tool, args) => {
    await Matthias.ask(words)
    expect(runAgentTool).toHaveBeenCalledWith(tool, args)
})

it("says what the tool said when it could not", async () => {
    vi.mocked(runAgentTool).mockResolvedValue({ ok: false, error: "The sound is still playing." })
    await Matthias.ask("stop the music")
    expect(get(matthiasStatus)).toEqual({ state: "failed", text: "The sound is still playing." })
})

it("says that the plan is the reason there is no answer", async () => {
    model.llm = {}
    chat.run.mockResolvedValueOnce(null)
    planProblem.set("Scriptural AI comes with a Church plan.")
    await Matthias.ask("compose a welcome", true, true)
    expect(get(matthiasStatus)).toEqual({ state: "failed", text: "Scriptural AI comes with a Church plan." })
    planProblem.set("")
})

it("moves the video, turns the volume and runs a named timer", async () => {
    await Matthias.ask("pause the video")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_video", { command: "pause" })
    await Matthias.ask("skip ahead ten seconds")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_video", { command: "forward", seconds: 10 })
    await Matthias.ask("set the volume to 40")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_sound", { command: "set_volume", percent: 40 })
    await Matthias.ask("louder")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_sound", { command: "louder" })
    await Matthias.ask("start the offering timer")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_timer", { command: "start", name: "offering" })
    await Matthias.ask("stop all timers")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_timer", { command: "stop_all" })
})

it("starts and stops recording or the stream only when clearly asked", async () => {
    await Matthias.ask("start recording")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_recording", { command: "start" })
    await Matthias.ask("stop the stream in OBS")
    expect(runAgentTool).toHaveBeenLastCalledWith("control_stream", { command: "stop", with: "obs" })

    vi.mocked(runAgentTool).mockClear()
    ai.set({ matthias: { agentMode: true } })
    const sermon = ["We need to start recording what God has done", "Matthias was recording the names, stop recording", "Matthias. Stop recording.", "Matthias, start recording.", "They said to Matthias, go live your life", "Matthias, go live.", "Hey Matthew, stop the stream"]
    for (const words of sermon) {
        position += 2000
        hear(words, true)
        await settle()
    }
    expect(runAgentTool).not.toHaveBeenCalled()

    position += 2000
    hear("hey matthias stop recording", true)
    await settle()
    expect(runAgentTool).toHaveBeenCalledWith("control_recording", { command: "stop" })
})

it("never lets the model start or stop recording from words spoken in the room", async () => {
    model.llm = { request: vi.fn() }
    chat.run.mockImplementationOnce(async (_history, deps) => ({ content: deps.refuse("control_recording") + " | " + deps.refuse("control_stream") }))
    await Matthias.ask("could you get the cameras rolling", true)
    expect(chat.run.mock.calls[0][1].refuse("control_stream")).toMatch(/Hey Matthias/)
})

it("shows a passage in the Bible named with it", async () => {
    await Matthias.ask("show John 3:16 in the NLT")
    expect(openVersion).toHaveBeenCalledWith("nlt")
    expect(manager.showReference).toHaveBeenCalledWith("John 3:16")
})

it("adds a passage, a video or the logo to the open plan", async () => {
    const added = async (words: string) => {
        vi.mocked(runAgentTool).mockClear()
        await Matthias.ask(words)
        return vi.mocked(runAgentTool).mock.calls[0]
    }
    expect(await added("add John 3:16 in the NLT to the plan")).toEqual(["add_to_plan", { plan: "p", scripture: "John 3:16", version: "nlt" }])
    expect(await added("add the welcome video to the plan")).toEqual(["add_to_plan", { plan: "p", media: "welcome" }])
    expect(await added("add the logo to the plan")).toEqual(["add_to_plan", { plan: "p", overlay: "l" }])
    expect(await added("add Amazing Grace to the plan")).toEqual(["add_to_plan", { plan: "p", song: "a" }])
})

it("goes to true black, and can bring it back", async () => {
    await Matthias.ask("true black")
    expect(manager.asOwnChange).toHaveBeenCalled()
    expect(runAgentTool).toHaveBeenCalledWith("control_screen", { command: "black" })
})
