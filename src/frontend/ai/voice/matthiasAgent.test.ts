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
import { Matthias, matthiasStatus } from "./matthiasAgent"

let position = 0
beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    ai.set({})
    outLocked.set(false)
    position += 2000
})
// each test is a new stretch of one long transcript
const hear = (words: string, ended = false) => Matthias.hear(words, position, ended)
const settle = () => vi.advanceTimersByTimeAsync(10_000)

it("waits for the request to be finished, then does it once", async () => {
    expect(hear("so the love of God is real matthias show")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(hear("so the love of God is real matthias show john three")).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(manager.showReference).not.toHaveBeenCalled()
    hear("so the love of God is real, Matthias, show John three sixteen.", true)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
    // the same words, heard again as the transcript grows
    expect(hear("so the love of God is real, Matthias, show John three sixteen. And we know")).toBe(false)
    await settle()
    expect(manager.showReference).toHaveBeenCalledTimes(1)
})

it("does one request after another", async () => {
    hear("matthias next verse", true)
    await settle()
    hear("matthias next verse and the light matthias clear the screen", true)
    await settle()
    expect(manager.navigateNow).toHaveBeenCalledTimes(1)
    expect(clearSlide).toHaveBeenCalledTimes(1)
})

it("searches, shows the best, and moves to another", async () => {
    await Matthias.ask("find the verse about being anxious")
    expect(manager.showReference).toHaveBeenLastCalledWith("Philippians 4:6")
    await Matthias.ask("another one")
    expect(manager.showReference).toHaveBeenLastCalledWith("Matthew 6:25")
})

it("plays a song of the library", async () => {
    await Matthias.ask("sing amazing grace")
    expect(presentSong).toHaveBeenCalledWith("a", "")
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

it("says nothing when the name was only said in passing, or is switched off", async () => {
    hear("matthias was a faithful man", true)
    await settle()
    expect(get(matthiasStatus)).toBeNull()
    ai.set({ matthias: { name: false } })
    expect(hear("and then matthias next verse", true)).toBe(false)
})
