import { describe, expect, it, vi } from "vitest"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    const names = ["activePage", "activeProject", "aiSuggestions", "audioChannelsData", "outLocked", "outputs", "overlays", "paintCache", "projects", "scriptures", "shows", "showsCache", "styles", "sttTranscript", "ai"]
    return Object.fromEntries(names.map((name) => [name, writable(name === "outLocked" ? false : {})]))
})
vi.mock("../../components/actions/apiHelper", () => ({ playMedia: vi.fn(), addToProject: vi.fn(), createProject: vi.fn(), getClearedState: vi.fn(() => ({})), getPlainText: vi.fn(), toggleSttListening: vi.fn() }))
vi.mock("../../components/drawer/bible/scripture", () => ({}))
vi.mock("../../audio/audioFading", () => ({}))
vi.mock("../../components/actions/apiGet", () => ({}))
vi.mock("../../components/helpers/output", () => ({}))
vi.mock("../../components/draw/paintLines", () => ({}))
vi.mock("./illustration", () => ({ MAX_SHAPES: 10 }))
vi.mock("../../components/helpers/setShow", () => ({}))
vi.mock("../../components/helpers/show", () => ({}))
vi.mock("../../components/helpers/showActions", () => ({}))
vi.mock("../../components/output/clear", () => ({}))
vi.mock("../../components/drawer/timers/speakerTimerActions", () => ({}))
vi.mock("../../converters/txt", () => ({}))
vi.mock("../../scriptural/connection", () => ({ ANON_KEY: "", FUNCTIONS_URL: "" }))
vi.mock("../../converters/bible", () => ({}))
vi.mock("../liveCopilot", async () => ({ copilotListening: (await import("svelte/store")).writable(false) }))
vi.mock("./stepScreen", () => ({}))
vi.mock("../components/floating/onScreen", () => ({}))
vi.mock("../../components/show/project", () => ({}))
vi.mock("../scripture/passage", () => ({}))
vi.mock("../songs/librarySongs", () => ({}))
vi.mock("../voice/matthias", () => ({ PAGES: new Map() }))
vi.mock("../voice/versions", () => ({}))
vi.mock("./control", () => ({ isHeld: () => false, setAgentMode: vi.fn() }))
vi.mock("./listFromPoints", () => ({}))
vi.mock("./mediaLibrary", () => ({}))
vi.mock("./openPage", () => ({}))
vi.mock("./planItems", () => ({}))
vi.mock("./presentPassage", () => ({}))
import { get } from "svelte/store"
import { playMedia } from "../../components/actions/apiHelper"
import { outLocked } from "../../stores"
import { listAgentTools, runAgentTool } from "./agentTools"

describe("agent tools", () => {
    it("cannot unlock a screen the operator locked", async () => {
        outLocked.set(true)
        const answer = await runAgentTool("control_screen", { command: "unlock" })
        expect(answer.ok).toBe(false)
        expect(get(outLocked)).toBe(true)
        const control = listAgentTools().find((tool) => tool.name === "control_screen")
        expect(control?.inputSchema.properties.command.enum).not.toContain("unlock")
    })

    it("keeps internal tools from a model's pick, and lets the app's own server use them", async () => {
        outLocked.set(false)
        expect((await runAgentTool("show_media", { path: "/a.mp4" })).ok).toBe(false)
        expect(playMedia).not.toHaveBeenCalled()
        expect((await runAgentTool("show_media", { path: "/a.mp4" }, true)).ok).toBe(true)
        expect(playMedia).toHaveBeenCalledWith({ path: "/a.mp4" })
    })
})
