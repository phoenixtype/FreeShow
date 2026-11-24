import { beforeEach, expect, it, vi } from "vitest"

vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { activeScripture: writable({}), ai: writable({}), aiSuggestions: writable([]), outLocked: writable(false), scriptures: writable({}), shows: writable({ a: { name: "Amazing Grace" } }) }
})
vi.mock("../../components/actions/apiHelper", () => ({ startScripture: vi.fn(), toggleSttListening: vi.fn() }))
vi.mock("../../components/drawer/bible/scripture", () => ({ getShortBibleName: () => "" }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => ({ out: { slide: { id: "temp" } } }), toggleOutputs: vi.fn() }))
vi.mock("../../components/output/clear", () => ({ clearAll: vi.fn(), clearSlide: vi.fn(), restoreOutput: vi.fn() }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../agent/agentChat", () => ({ agentInstructions: () => "", runAgentChat: vi.fn() }))
vi.mock("../agent/agentTools", () => ({ searchBible: vi.fn(async () => [{ reference: "Philippians 4:6" }, { reference: "Matthew 6:25" }]), ToolError: class extends Error {} }))
vi.mock("../agent/stepScreen", () => ({ stepScreen: vi.fn() }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("../llm/prompts", () => ({ CHAT_RESPONSE_SCHEMA: {}, CHAT_SYSTEM_PROMPT: "" }))
vi.mock("../songs/librarySongs", () => ({ presentSong: vi.fn() }))
vi.mock("../scripture/BibleCacheManager", () => ({ BibleCacheManager: { getCanon: vi.fn() } }))
const manager = vi.hoisted(() => ({ showReference: vi.fn(), findReference: vi.fn(async (w: string) => (/john/i.test(w) ? "John 3:16" : null)), navigateNow: vi.fn(async () => "John 3:17"), letGo: vi.fn(), asOwnChange: vi.fn((_c: string, f: () => unknown) => f()) }))
vi.mock("../manager/AiManager", () => ({ AiManager: manager }))

import { get } from "svelte/store"
import { clearSlide } from "../../components/output/clear"
import { ai, outLocked } from "../../stores"
import { presentSong } from "../songs/librarySongs"
import { Silas, silasStatus } from "./silasAgent"

let position = 0
beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    ai.set({})
    outLocked.set(false)
    position += 2000
})
// each test is a new stretch of one long transcript
const hear = (words: string, ended = false) => Silas.hear(words, position, ended)
const settle = () => vi.advanceTimersByTimeAsync(10_000)

it("waits for the request to be finished, then does it once", async () => {
    expect(hear("so the love of God is real silas show")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(hear("so the love of God is real silas show john three")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(manager.showReference).not.toHaveBeenCalled()
    hear("so the love of God is real, Silas, show John three sixteen.", true)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
    // the same words, heard again as the transcript grows
    expect(hear("so the love of God is real, Silas, show John three sixteen. And we know")).toBe(false)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
})

it("does one request after another", async () => {
    hear("silas next verse", true)
    await settle()
    hear("silas next verse and the light silas clear the screen", true)
    await settle()
    expect(manager.navigateNow).toHaveBeenCalledTimes(1)
    expect(clearSlide).toHaveBeenCalledTimes(1)
})

it("searches, shows the best, and moves to another", async () => {
    await Silas.ask("find the verse about being anxious")
    expect(manager.showReference).toHaveBeenLastCalledWith("Philippians 4:6")
    await Silas.ask("another one")
    expect(manager.showReference).toHaveBeenLastCalledWith("Matthew 6:25")
})

it("plays a song of the library", async () => {
    await Silas.ask("sing amazing grace")
    expect(presentSong).toHaveBeenCalledWith("a", "")
})

it("leaves a locked screen alone", async () => {
    outLocked.set(true)
    await Silas.ask("show John 3 16")
    expect(manager.showReference).not.toHaveBeenCalled()
    expect(get(silasStatus)).toEqual({ state: "failed", text: "The screen is locked" })
})

it("takes and gives back the lead", async () => {
    await Silas.ask("take over")
    expect(get(ai).silas?.agentMode).toBe(true)
    await Silas.ask("stand down")
    expect(get(ai).silas?.agentMode).toBe(false)
})

it("says nothing when the name was only said in passing, or is switched off", async () => {
    hear("silas was a faithful man", true)
    await settle()
    expect(get(silasStatus)).toBeNull()
    ai.set({ silas: { name: false } })
    expect(hear("and then silas next verse", true)).toBe(false)
})
