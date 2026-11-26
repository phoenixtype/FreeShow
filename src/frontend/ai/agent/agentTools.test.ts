import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    const names = ["activeTimers", "timers", "playingAudio", "activePage", "activeProject", "aiSuggestions", "audioChannelsData", "outLocked", "outputs", "overlays", "paintCache", "playingVideos", "activeRecording", "obsData", "projects", "scriptures", "shows", "showsCache", "styles", "sttTranscript", "ai"]
    return Object.fromEntries(names.map((name) => [name, writable(name === "outLocked" ? false : name === "activeTimers" ? [] : {})]))
})
vi.mock("../../components/actions/apiHelper", () => ({ playMedia: vi.fn(), addToProject: vi.fn(), createProject: vi.fn(), getClearedState: vi.fn(() => ({ all: false })), getPlainText: vi.fn(), toggleSttListening: vi.fn() }))
vi.mock("../../components/drawer/bible/scripture", () => ({}))
const video = vi.hoisted(() => ({ duration: 0, time: 0, paused: false }))
const api = vi.hoisted(() => ({
    get_playing_video_state: vi.fn(() => ({ ...video })),
    video_seekto: vi.fn(),
    change_volume: vi.fn(),
    id_start_timer: vi.fn(),
    id_pause_timer: vi.fn(),
    id_stop_timer: vi.fn(),
    stop_timers: vi.fn(),
    start_output_recording: vi.fn(),
    stop_output_recording: vi.fn(),
    start_rtmp_stream: vi.fn(),
    stop_rtmp_stream: vi.fn(),
    start_webrtc_stream: vi.fn(),
    stop_webrtc_stream: vi.fn(),
    obs_start_recording: vi.fn(),
    obs_stop_recording: vi.fn(),
    obs_start_livestream: vi.fn(),
    obs_stop_livestream: vi.fn()
}))
vi.mock("../../components/actions/api", () => ({ API_ACTIONS: api }))
const player = vi.hoisted(() => ({ play: vi.fn(() => (video.paused = false)), pause: vi.fn(() => (video.paused = true)) }))
vi.mock("../../components/media/video/videoPlayer", () => ({ VideoPlayer: player }))
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
const library = vi.hoisted(() => ({ findSongsByLine: vi.fn((): { id: string; name: string; share: number }[] => []) }))
vi.mock("../songs/librarySongs", () => library)
vi.mock("../voice/matthias", () => ({ PAGES: [], matchTitle: (name: string, list: any[]) => (name === "welcome" ? list[0] : null) }))
vi.mock("../voice/versions", () => ({}))
vi.mock("./control", () => ({ isHeld: () => false, setAgentMode: vi.fn(() => false) }))
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
import { activeRecording, activeTimers, ai, audioChannelsData, obsData, outLocked, outputs, overlays, playingAudio, shows, timers } from "../../stores"
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
    it("takes part of a minute, and a picture or video by its path", async () => {
        expect((await run("speaker_timer", { command: "set", minutes: 0.5 })).error).toMatch(/did not start/)
        screen.out = { background: { path: "/v/welcome.mp4" } }
        expect((await run("show_picture_or_video", { name: "/v/welcome.mp4" })).ok).toBe(true)
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

it("cannot turn agent mode on for the operator", async () => {
    const answer = await runAgentTool("set_agent_mode", { on: true })
    expect(answer).toEqual({ ok: false, error: expect.stringMatching(/Turn on/) })
})

describe("finding a song by its words", () => {
    beforeEach(() => vi.clearAllMocks())
    it("lists the matches with how good each is, and shows none of them", async () => {
        library.findSongsByLine.mockReturnValueOnce([
            { id: "s1", name: "Amazing Grace", share: 1 },
            { id: "s2", name: "Another", share: 0.25 }
        ])
        const answer = await runAgentTool("find_song_by_words", { line: "how sweet the sound" })
        expect(answer.result).toEqual({
            songs: [
                { id: "s1", name: "Amazing Grace", match: "strong" },
                { id: "s2", name: "Another", match: "weak" }
            ],
            next: expect.stringMatching(/present_song/)
        })
        expect(manager.showSong).not.toHaveBeenCalled()
        expect(listAgentTools().find((tool) => tool.name === "find_song_by_words")?.readOnly).toBe(true)
    })
    it("says when no song has the line", async () => {
        expect((await runAgentTool("find_song_by_words", { line: "quarterly budget report" })).error).toMatch(/No song/)
    })
})

describe("video, volume and timers go through the app's own actions", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        outLocked.set(false)
        screen.out = { background: { path: "/v/welcome.mp4" } }
        Object.assign(video, { duration: 100, time: 40, paused: false })
        activeTimers.set([])
        timers.set({ o: { name: "Offering", type: "counter" }, s: { name: "Sermon", type: "counter" } } as any)
        audioChannelsData.set({ main: { volume: 0.5 } } as any)
    })
    afterEach(() => vi.useRealTimers())
    const run = async (name: string, args: any) => {
        const answer = runAgentTool(name, args)
        await vi.advanceTimersByTimeAsync(10_000)
        return answer
    }

    it("pauses, plays and skips the video on screen", async () => {
        expect((await run("control_video", { command: "pause" })).ok).toBe(true)
        expect(player.pause).toHaveBeenCalledWith("/v/welcome.mp4", "o")
        expect((await run("control_video", { command: "play" })).ok).toBe(true)
        await run("control_video", { command: "forward", seconds: 30 })
        expect(api.video_seekto).toHaveBeenLastCalledWith({ seconds: 70 })
        await run("control_video", { command: "back", seconds: 90 })
        expect(api.video_seekto).toHaveBeenLastCalledWith({ seconds: 0 })
        await run("control_video", { command: "restart" })
        expect(api.video_seekto).toHaveBeenLastCalledWith({ seconds: 0 })
    })
    it("says there is no video, and leaves a locked screen alone", async () => {
        video.duration = 0
        expect((await run("control_video", { command: "pause" })).error).toMatch(/No video/)
        video.duration = 100
        outLocked.set(true)
        expect((await run("control_video", { command: "pause" })).ok).toBe(false)
        expect(player.pause).not.toHaveBeenCalled()
    })
    it("turns the volume a step, or to a number", async () => {
        api.change_volume.mockImplementation(({ volume }) => audioChannelsData.set({ main: { volume } } as any))
        expect((await run("control_sound", { command: "louder" })).result).toEqual({ volume: "60 percent" })
        expect((await run("control_sound", { command: "set_volume", percent: 5 })).result).toEqual({ volume: "5 percent" })
        expect(api.change_volume).toHaveBeenLastCalledWith({ volume: 0.05 })
        expect((await run("control_sound", { command: "quieter" })).result).toEqual({ volume: "0 percent" })
        expect((await run("control_sound", { command: "set_volume" })).error).toMatch(/how loud/)
    })
    it("starts, pauses and stops a timer by its name", async () => {
        api.id_start_timer.mockImplementation(({ id }) => activeTimers.set([{ id }]))
        api.id_pause_timer.mockImplementation(({ id }) => activeTimers.set([{ id, paused: true }]))
        api.id_stop_timer.mockImplementation(() => activeTimers.set([]))
        expect((await run("control_timer", { command: "start", name: "offering" })).ok).toBe(true)
        expect(api.id_start_timer).toHaveBeenCalledWith({ id: "o" })
        expect((await run("control_timer", { command: "pause", name: "Offering" })).ok).toBe(true)
        expect((await run("control_timer", { command: "stop", name: "Offering" })).ok).toBe(true)
        expect((await run("control_timer", { command: "start", name: "lunch" })).error).toMatch(/Offering, Sermon|Nothing named/)
        expect((await run("control_timer", {})).result).toEqual({
            timers: [
                { name: "Offering", running: false },
                { name: "Sermon", running: false }
            ]
        })
    })
})

describe("recording and the live stream", () => {
    const rtmp = (streaming: boolean) => outputs.set({ o: { rtmp: true, rtmpData: { streaming, destinations: [{ enabled: true, url: "rtmp://x" }] } } } as any)
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        activeRecording.set(null)
        obsData.set({})
        outputs.set({})
    })
    afterEach(() => vi.useRealTimers())
    const run = async (name: string, args: any) => {
        const answer = runAgentTool(name, args)
        await vi.advanceTimersByTimeAsync(20_000)
        return answer
    }

    it("are marked as things to ask about first", () => {
        const tools = listAgentTools()
        for (const name of ["control_recording", "control_stream"]) expect(tools.find((tool) => tool.name === name)?.destructive).toBe(true)
    })
    it("records in the app, and says so only when it is recording", async () => {
        expect((await run("control_recording", { command: "start" })).error).toMatch(/did not start/)
        api.start_output_recording.mockImplementationOnce(() => activeRecording.set({ isOutput: true }))
        expect((await run("control_recording", { command: "start" })).ok).toBe(true)
        api.stop_output_recording.mockImplementationOnce(() => activeRecording.set(null))
        expect((await run("control_recording", { command: "stop" })).ok).toBe(true)
        expect((await run("control_recording", { command: "stop" })).error).toMatch(/Nothing is being recorded/)
        expect(api.obs_stop_recording).not.toHaveBeenCalled()
    })
    it("records in OBS when asked, and says when OBS is not there", async () => {
        expect((await run("control_recording", { command: "start", with: "obs" })).error).toMatch(/OBS/)
        expect(api.obs_start_recording).not.toHaveBeenCalled()
        obsData.set({ enabled: true, connected: true })
        expect((await run("control_recording", { command: "start", with: "obs" })).ok).toBe(true)
        expect(api.obs_start_recording).toHaveBeenCalled()
        expect(api.start_output_recording).not.toHaveBeenCalled()
        obsData.set({ enabled: true, connected: false })
        expect((await run("control_recording", { command: "start", with: "obs" })).error).toMatch(/not connected/)
    })
    it("goes live where the church set it up, else says there is no stream", async () => {
        expect((await run("control_stream", { command: "start" })).error).toMatch(/No live stream is set up/)
        rtmp(false)
        api.start_rtmp_stream.mockImplementationOnce(() => rtmp(true))
        expect((await run("control_stream", { command: "start" })).ok).toBe(true)
        api.stop_rtmp_stream.mockImplementationOnce(() => rtmp(false))
        expect((await run("control_stream", { command: "stop" })).ok).toBe(true)
        expect((await run("control_stream", { command: "stop" })).error).toMatch(/Nothing is streaming/)
        obsData.set({ enabled: true, connected: true })
        outputs.set({})
        expect((await run("control_stream", { command: "start" })).ok).toBe(true)
        expect(api.obs_start_livestream).toHaveBeenCalled()
    })
})
