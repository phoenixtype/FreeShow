import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    const names = ["activeTimers", "timers", "playingAudio", "activePage", "activeProject", "aiSuggestions", "audioChannelsData", "outLocked", "outputs", "overlays", "paintCache", "projects", "scriptures", "shows", "showsCache", "styles", "sttTranscript", "ai"]
    return Object.fromEntries(names.map((name) => [name, writable(name === "outLocked" ? false : name === "activeTimers" ? [] : {})]))
})
vi.mock("../../components/actions/apiHelper", () => ({ playMedia: vi.fn(), addToProject: vi.fn(), createProject: vi.fn(), getClearedState: vi.fn(() => ({ all: false })), getPlainText: vi.fn(), toggleSttListening: vi.fn() }))
vi.mock("../../components/drawer/bible/scripture", () => ({}))
vi.mock("../../audio/audioFading", () => ({ clearAudio: vi.fn() }))
vi.mock("../../components/actions/apiGet", () => ({ getOutputSlideText: () => "" }))
const screen = vi.hoisted(() => ({ out: {} as any }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => ({ id: "o", out: screen.out }), setOutput: vi.fn(), toggleOutputs: vi.fn() }))
vi.mock("../../components/draw/paintLines", () => ({}))
vi.mock("./illustration", () => ({ MAX_SHAPES: 10 }))
vi.mock("../../components/helpers/setShow", () => ({ loadShows: vi.fn() }))
vi.mock("../../components/helpers/show", () => ({ getLayoutRef: () => [{}, {}, {}] }))
vi.mock("../../components/helpers/showActions", () => ({}))
vi.mock("../../components/output/clear", () => ({ clearAll: vi.fn(), clearBackground: vi.fn(), clearOverlays: vi.fn(), clearSlide: vi.fn(), restoreOutput: vi.fn() }))
vi.mock("../../components/drawer/timers/speakerTimerActions", () => ({ addSpeakerTime: vi.fn(), nextProgramSegment: vi.fn(), playPauseSpeaker: vi.fn(), setSpeakerDuration: vi.fn(), startProgram: vi.fn() }))
vi.mock("../../converters/txt", () => ({}))
vi.mock("../../scriptural/connection", () => ({ ANON_KEY: "", FUNCTIONS_URL: "" }))
vi.mock("../../converters/bible", () => ({}))
vi.mock("../liveCopilot", async () => ({ copilotListening: (await import("svelte/store")).writable(false) }))
vi.mock("./stepScreen", () => ({ stepScreen: vi.fn(async () => true) }))
vi.mock("../components/floating/onScreen", () => ({ onScreenTitle: () => "" }))
vi.mock("../../components/show/project", () => ({}))
vi.mock("../scripture/passage", () => ({ readPassage: vi.fn(async () => "For God so loved the world") }))
vi.mock("../songs/librarySongs", () => ({}))
vi.mock("../voice/matthias", () => ({ PAGES: [], matchTitle: (_n: string, list: any[]) => list[0] || null }))
vi.mock("../voice/versions", () => ({}))
vi.mock("./control", () => ({ isHeld: () => false, setAgentMode: vi.fn() }))
vi.mock("./listFromPoints", () => ({}))
vi.mock("./mediaLibrary", () => ({ mediaList: () => [{ id: "/v/welcome.mp4", name: "welcome", kind: "video" }] }))
vi.mock("./openPage", () => ({}))
vi.mock("./planItems", () => ({ planItems: () => [{ id: "s1", index: 0, label: "Amazing Grace", type: "show" }], nextPlanItem: () => ({ id: "s1", index: 0, label: "Amazing Grace", type: "show" }), showPlanItem: vi.fn(), removeFromOpenPlan: vi.fn() }))
vi.mock("./presentPassage", () => ({ presentPassage: vi.fn() }))
const manager = vi.hoisted(() => ({ showReference: vi.fn(), showSong: vi.fn() }))
vi.mock("../manager/AiManager", () => ({ AiManager: manager }))
import { get } from "svelte/store"
import { playMedia } from "../../components/actions/apiHelper"
import { copilotListening } from "../liveCopilot"
import { ai, outLocked, overlays, playingAudio, shows, timers } from "../../stores"
import { listAgentTools, runAgentTool } from "./agentTools"

describe("agent tools", () => {
    it("cannot unlock a screen the operator locked", async () => {
        outLocked.set(true)
        const answer = await runAgentTool("control_screen", { command: "unlock" })
        expect(answer.ok).toBe(false)
        expect(get(outLocked)).toBe(true)
        const control = listAgentTools().find((tool) => tool.name === "control_screen")
        expect(control?.inputSchema.properties.command.enum).not.toContain("unlock")
        expect(control?.destructive).toBe(true)
        expect(listAgentTools().find((tool) => tool.name === "remove_from_plan")?.destructive).toBe(true)
        expect(listAgentTools().find((tool) => tool.name === "get_live_state")?.destructive).toBe(false)
    })

    it("keeps internal tools from a model's pick, and lets the app's own server use them", async () => {
        outLocked.set(false)
        expect((await runAgentTool("show_media", { path: "/a.mp4" })).ok).toBe(false)
        expect(playMedia).not.toHaveBeenCalled()
        expect((await runAgentTool("show_media", { path: "/a.mp4" }, true)).ok).toBe(true)
        expect(playMedia).toHaveBeenCalledWith({ path: "/a.mp4" })
    })
})

// "done" has to mean the screen did it, not that it was asked to
describe("a tool says done only when it happened", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        screen.out = {}
        outLocked.set(false)
        playingAudio.set({})
        timers.set({})
    })
    afterEach(() => vi.useRealTimers())

    const run = async (name: string, args: any) => {
        const answer = runAgentTool(name, args)
        await vi.advanceTimersByTimeAsync(10_000)
        return answer
    }

    it("for listening that did not start", async () => {
        ai.set({ enabled: true, stt: { micDeviceId: "m" } } as any)
        copilotListening.set(false)
        expect((await run("set_listening", { on: true })).ok).toBe(false)
    })
    it("for a step that moved nothing", async () => {
        screen.out = { slide: { id: "a", index: 3 } }
        const answer = await run("control_screen", { command: "next" })
        expect(answer.ok).toBe(false)
    })
    it("for a plan item that did not arrive", async () => {
        expect((await run("show_plan_item", { item: "next" })).ok).toBe(false)
        screen.out = { slide: { id: "s1" } }
        expect((await run("show_plan_item", { item: "next" })).ok).toBe(true)
    })
    it("for an overlay that did not arrive", async () => {
        overlays.set({ l: { name: "Logo" } } as any)
        expect((await run("show_overlay", { name: "Logo" })).ok).toBe(false)
        screen.out = { overlays: ["l"] }
        expect((await run("show_overlay", { name: "Logo" })).ok).toBe(true)
    })
    it("for a video that did not arrive", async () => {
        expect((await run("show_picture_or_video", { name: "welcome" })).ok).toBe(false)
        screen.out = { background: { path: "/v/welcome.mp4" } }
        expect((await run("show_picture_or_video", { name: "welcome" })).ok).toBe(true)
    })
    it("for sound that is still playing", async () => {
        playingAudio.set({ "/a.mp3": {} } as any)
        expect((await run("control_sound", { command: "stop" })).ok).toBe(false)
        playingAudio.set({})
        expect((await run("control_sound", { command: "stop" })).ok).toBe(true)
    })
    it("for a speaker timer that was never set", async () => {
        expect((await run("speaker_timer", { command: "add", minutes: 2 })).ok).toBe(false)
        expect((await run("speaker_timer", { command: "start" })).ok).toBe(false)
        expect((await run("speaker_timer", { command: "set", minutes: 5 })).ok).toBe(false)
    })
})

// what a tool puts up is Matthias's too, so "bring it back" and "the song before" know about it
describe("showing by tool goes through the copilot's own memory", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        outLocked.set(false)
        screen.out = {}
    })

    it("shows scripture with AiManager.showReference", async () => {
        manager.showReference.mockImplementationOnce(async () => (screen.out = { slide: { id: "temp" } }))
        const answer = await runAgentTool("show_scripture", { reference: "John 3:16" })
        expect(manager.showReference).toHaveBeenCalledWith("John 3:16")
        expect(answer.ok).toBe(true)
    })

    it("says so when the passage cannot be put up", async () => {
        manager.showReference.mockRejectedValueOnce(new Error("John 3:16 could not be put up"))
        expect(await runAgentTool("show_scripture", { reference: "John 3:16" })).toEqual({ ok: false, error: expect.stringMatching(/did not reach the screen/) })
    })

    it("shows a song with AiManager.showSong, from the slide asked for", async () => {
        shows.set({ s1: { name: "Amazing Grace" } } as any)
        manager.showSong.mockImplementationOnce(async () => (screen.out = { slide: { id: "s1" } }))
        const answer = await runAgentTool("present_song", { name: "Amazing Grace", slide: 2 })
        expect(manager.showSong).toHaveBeenCalledWith({ id: "s1", name: "Amazing Grace" }, 1)
        expect(answer.ok).toBe(true)
    })
})
