import { beforeEach, describe, expect, it, vi } from "vitest"

const screen = vi.hoisted(() => ({
    present: vi.fn(async (_reference: string, _id?: string) => true),
    current: vi.fn((): any => ({ id: "kjv", reference: { book: 43, chapters: [3], verses: [[16]] } }))
}))

vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return {
        ai: writable({ enabled: true, scripture: { confidence: "high" }, lyrics: { confidence: "high" } }),
        aiSmartAction: writable(null),
        aiSuggestions: writable([]),
        drawerTabsData: writable({}),
        outLocked: writable(false),
        outputCache: writable(null),
        outputs: writable({}),
        scriptures: writable({})
    }
})
vi.mock("../../components/helpers/array", () => ({ clone: (a: any) => structuredClone(a), keysToID: (a: any) => Object.entries(a).map(([id, value]: any) => ({ ...value, id })) }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null, setOutput: vi.fn() }))
vi.mock("../../components/drawer/bible/scripture", async () => ({
    loadJsonBible: async () => ({ data: { books: [{ number: 43, name: "John", chapters: [1, 2, 3].map((number) => ({ number, verses: Array.from({ length: 36 }, (_, i) => ({ number: i + 1 })) })) }] } }),
    screenScripture: (await import("svelte/store")).writable({})
}))
vi.mock("../../components/output/clear", () => ({ clearAll: vi.fn(), clearSlide: vi.fn(), restoreOutput: vi.fn() }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("../agent/control", () => ({
    handBack: vi.fn(),
    isHeld: () => false,
    movedByHand: vi.fn(),
    OwnChanges: class {
        expect() {}
        settle() {}
        isOwn() {
            return true
        }
    }
}))
vi.mock("../agent/presentPassage", () => ({ presentPassage: screen.present, currentScripture: screen.current, otherTab: () => "" }))
vi.mock("../llm/aiDetection", () => ({ usesAiDetection: () => false }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("../scripture/BibleCacheManager", () => ({ BibleCacheManager: { getCache: vi.fn(async () => null), getCanon: vi.fn(), preloadAllInBackground: vi.fn() } }))
vi.mock("../scripture/BibleVersionDetector", () => ({ detectBibleVersion: vi.fn(async () => null) }))
vi.mock("../scripture/bibleEvents", () => ({ detectBibleEvents: vi.fn(() => []) }))
vi.mock("../scripture/meaningSearch", () => ({ searchByMeaning: vi.fn() }))
vi.mock("../songs/librarySongs", () => ({ followSong: vi.fn(), liveShowId: () => "", presentSong: vi.fn(), songDetector: vi.fn(() => null) }))
vi.mock("../stt/stt", () => ({ resolveSttEngine: () => "nemotron", spokenLanguage: () => "en" }))

import { get } from "svelte/store"
import { ai, aiSmartAction, aiSuggestions } from "../../stores"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleEvents } from "../scripture/bibleEvents"
import { AiManager } from "./AiManager"

const manager = AiManager as any
const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
    screen.present.mockClear()
    screen.present.mockImplementation(async () => true)
    aiSuggestions.set([])
    aiSmartAction.set(null)
    manager.liveContent = ""
    manager.lastCommand = 0
    manager.shown = []
    manager.undone = null
    manager.pendingContent = ""
})

describe("a whole utterance (B1)", () => {
    it("steps the verse only when the command is all that was said", async () => {
        expect(await AiManager.processUtterance("…Jesus is coming back.")).toBe(false)
        expect(await AiManager.processUtterance("and what comes next")).toBe(false)
        expect(screen.present).not.toHaveBeenCalled()

        expect(await AiManager.processUtterance("Back.")).toBe(true)
        expect(screen.present.mock.calls.map((call) => call[0])).toEqual(["43.3.15"])
    })

    it("leaves phrases that count mid-sentence to the chunk that already acted on them", async () => {
        expect(await AiManager.processUtterance("let us go to the next verse")).toBe(false)
        expect(screen.present).not.toHaveBeenCalled()
    })
})

describe("reading inside the range on screen (B9)", () => {
    it("keeps the range up", async () => {
        manager.liveContent = "John 3:16-18"
        AiManager.newMatch({ type: "scripture", content: "John 3:17", confidence: 98 })
        await settle()
        expect(screen.present).not.toHaveBeenCalled()
        expect(get(aiSuggestions)).toEqual([])

        AiManager.newMatch({ type: "scripture", content: "John 3:19", confidence: 98 })
        await settle()
        expect(screen.present.mock.calls.map((call) => call[0])).toEqual(["John 3:19"])
    })
})

describe("showing again (B15)", () => {
    const shownAgo = (ms: number) => [{ id: "a", content: "John 3:16", confidence: 100, timestamp: Date.now() - ms, action: "presented" }]
    const back = { type: "scripture" as const, content: "John 3:16", confidence: 85 }

    it("waits only a moment before a passage can come back", async () => {
        aiSuggestions.set(shownAgo(5_000))
        AiManager.newMatch(back)
        await settle()
        expect(screen.present).not.toHaveBeenCalled()

        aiSuggestions.set(shownAgo(60_000))
        AiManager.newMatch(back)
        await settle()
        expect(screen.present).toHaveBeenCalledTimes(1)
    })

    it("puts a reference up once when two chunks carry it", async () => {
        let land = (_up: boolean) => {}
        screen.present.mockImplementationOnce(() => new Promise<boolean>((resolve) => (land = resolve)))
        const match = { type: "scripture" as const, content: "John 3:16", confidence: 98 }
        AiManager.newMatch(match)
        AiManager.newMatch(match)
        land(true)
        await settle()
        expect(screen.present).toHaveBeenCalledTimes(1)
    })

    it("only offers a Bible story that was mentioned", async () => {
        ai.set({ enabled: true, scripture: { confidence: "medium" } } as any)
        vi.mocked(BibleCacheManager.getCanon).mockResolvedValue({ search: async () => null } as any)
        vi.mocked(detectBibleEvents).mockReturnValueOnce([{ reference: "Matthew 14:22-33", confidence: 0.9 }] as any)
        await AiManager.processSTTChunk({ chunkWithOverlap: "when Jesus walked on water", newWordsCount: 5 })
        await settle()
        expect(screen.present).not.toHaveBeenCalled()
        expect(get(aiSuggestions)).toMatchObject([{ content: "Matthew 14:22-33", action: "present" }])
        ai.set({ enabled: true, scripture: { confidence: "high" }, lyrics: { confidence: "high" } } as any)
    })
})
