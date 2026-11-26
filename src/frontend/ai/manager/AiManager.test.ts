import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
vi.mock("../../components/helpers/showActions", () => ({ startShow: vi.fn() }))
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
vi.mock("../records/detectionLog", () => ({ logDetection: vi.fn() }))

import { get } from "svelte/store"
import { ai, aiSmartAction, aiSuggestions } from "../../stores"
import { presentSong, songDetector } from "../songs/librarySongs"
import { BibleCacheManager } from "../scripture/BibleCacheManager"
import { detectBibleEvents } from "../scripture/bibleEvents"
import { logDetection } from "../records/detectionLog"
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
    manager.lastScripture = 0
    manager.takenBack = { content: "", at: 0 }
    vi.mocked(presentSong).mockClear()
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

describe("a few lyric words over a reading (B14)", () => {
    const sing = (sustained: boolean) => vi.mocked(songDetector).mockReturnValueOnce({ push: () => ({ id: "amazing", name: "Amazing Grace", confidence: 90, sustained }) } as any)

    it("offers the song while scripture was just up, and shows it once it is really being sung", async () => {
        await AiManager.showReference("John 3:16")
        aiSuggestions.set([])
        sing(false)
        await manager.songDetection("amazing grace how sweet the sound")
        await settle()
        expect(presentSong).not.toHaveBeenCalled()
        expect(get(aiSuggestions)).toMatchObject([{ content: "Amazing Grace", confidence: 74, action: "present_song" }])

        aiSuggestions.set([])
        sing(true)
        await manager.songDetection("amazing grace how sweet the sound")
        await settle()
        expect(presentSong).toHaveBeenCalledTimes(1)
    })

    it("shows it as before when no scripture has been up", async () => {
        sing(false)
        await manager.songDetection("amazing grace how sweet the sound")
        await settle()
        expect(presentSong).toHaveBeenCalledTimes(1)
    })
})

describe("words arriving while a search runs (R10)", () => {
    // each chunk's search waits until the test lets it answer
    const run = async (gapMs: number) => {
        let now = 1_000_000
        const clock = vi.spyOn(Date, "now").mockImplementation(() => now)
        const answers: ((match: unknown) => void)[] = []
        const cancelled: (() => boolean)[] = []
        vi.mocked(BibleCacheManager.getCanon).mockResolvedValue({ search: (_t: string, _l: string, isCancelled: () => boolean) => new Promise((resolve) => (cancelled.push(isCancelled), answers.push(resolve))) } as any)

        const first = AiManager.processSTTChunk({ chunkWithOverlap: "john three sixteen", newWordsCount: 3 })
        await settle()
        now += gapMs
        const second = AiManager.processSTTChunk({ chunkWithOverlap: "and so we see", newWordsCount: 4 })
        await settle()
        const stopped = cancelled[0]()
        answers[0](null)
        answers[1](null)
        await Promise.all([first, second])
        clock.mockRestore()
        return stopped
    }

    it("lets a search that has hardly started finish, and stops an old one", async () => {
        expect(await run(100)).toBe(false)
        expect(await run(700)).toBe(true)
    })
})

describe("Undo after showing by itself (F4)", () => {
    it("can be taken back, and the same words do not put it straight up again", async () => {
        const match = { type: "scripture" as const, content: "John 3:16", confidence: 98 }
        AiManager.newMatch(match)
        await settle()
        expect(AiManager.canUndo("John 3:16")).toBe(true)

        expect(AiManager.undoChange()).toBe(true)
        expect(AiManager.canUndo("John 3:16")).toBe(false)
        AiManager.newMatch(match)
        await settle()
        expect(screen.present).toHaveBeenCalledTimes(1)
    })

    it("leaves the Presented bubble up for eight seconds", () => {
        vi.useFakeTimers()
        manager.addSuggestion({ id: "x", content: "John 3:16", confidence: 98, timestamp: Date.now(), action: "presented" })
        vi.advanceTimersByTime(7_900)
        expect(get(aiSmartAction)?.id).toBe("x")
        vi.advanceTimersByTime(200)
        expect(get(aiSmartAction)).toBeNull()
        vi.useRealTimers()
    })
})

describe("what was shown (F9)", () => {
    const add = (content: string, action: string, ago = 0) => manager.addSuggestion({ id: content + action, content, confidence: 80, timestamp: Date.now() - ago, action })

    it("is kept for the session, up to fifty, while offers time out", () => {
        const old = 60 * 60_000
        aiSuggestions.set([
            { id: "s", content: "John 1:1", confidence: 98, timestamp: Date.now() - old, action: "presented" },
            { id: "o", content: "John 1:2", confidence: 60, timestamp: Date.now() - old, action: "present" }
        ])
        for (let i = 0; i < 20; i++) add(`Psalms ${i}:1`, "present")
        expect(get(aiSuggestions).filter((a) => a.action === "present")).toHaveLength(15)
        expect(get(aiSuggestions).some((a) => a.id === "s")).toBe(true)
        // offered again: the record of the showing stays
        add("John 1:1", "present")
        expect(get(aiSuggestions).some((a) => a.id === "s")).toBe(true)

        for (let i = 0; i < 60; i++) add(`John 3:${i}`, "presented")
        expect(get(aiSuggestions).filter((a) => a.action === "presented")).toHaveLength(50)
    })

    it("includes an offer that was then put up, but not one that failed", async () => {
        ai.set({ enabled: true, scripture: { confidence: "ask" } } as any)
        AiManager.newMatch({ type: "scripture", content: "John 3:16", confidence: 90 })
        expect(get(aiSuggestions)[0].action).toBe("present")
        await get(aiSuggestions)[0].trigger?.()
        expect(get(aiSuggestions)[0].action).toBe("presented")

        ai.set({ enabled: true, scripture: { confidence: "high" }, lyrics: { confidence: "high" } } as any)
        vi.spyOn(console, "warn").mockImplementationOnce(() => {})
        screen.present.mockResolvedValueOnce(false)
        AiManager.newMatch({ type: "scripture", content: "John 3:17", confidence: 98 })
        await settle()
        expect(get(aiSuggestions)[0]).toMatchObject({ content: "John 3:17", action: "present" })
    })
})

describe("each way of catching things can be switched off", () => {
    const on = { enabled: true, scripture: { confidence: "high" }, lyrics: { confidence: "high" } }
    const canon = (search = vi.fn(async (..._args: any[]) => null)) => {
        vi.mocked(BibleCacheManager.getCanon).mockResolvedValue({ search } as any)
        return search
    }
    const chunk = (words: string) => AiManager.processSTTChunk({ chunkWithOverlap: words, newWordsCount: words.split(" ").length })
    const off = (setting: string) => ai.set({ ...on, scripture: { confidence: "high", [setting]: false } } as any)
    afterEach(() => ai.set(on as any))

    it("leaves a mentioned Bible story alone", async () => {
        canon()
        off("events")
        vi.mocked(detectBibleEvents).mockReturnValueOnce([{ reference: "Matthew 14:22-33", confidence: 0.9 }] as any)
        await chunk("when Jesus walked on water")
        expect(get(aiSuggestions)).toEqual([])
        vi.mocked(detectBibleEvents).mockReset()
        vi.mocked(detectBibleEvents).mockReturnValue([])
    })

    it("does not obey screen commands", async () => {
        canon()
        off("commands")
        expect(await AiManager.processUtterance("Back.")).toBe(false)
        await chunk("let us go to the next verse")
        await settle()
        expect(screen.present).not.toHaveBeenCalled()
        expect(get(aiSuggestions)).toEqual([])
    })

    it("tells the search whether to follow a verse number that is read out", async () => {
        const search = canon()
        await chunk("three Jesus answered and said")
        off("verseCue")
        await chunk("four Nicodemus saith unto him")
        expect(search.mock.calls.map((call) => call[4])).toEqual([true, false])
    })
})

describe("what is written to the detection log", () => {
    const lines = () => vi.mocked(logDetection).mock.calls.map(([line]) => [line.tier, line.found, line.action])
    const found = (match: object) => vi.mocked(BibleCacheManager.getCanon).mockResolvedValue({ search: async () => match } as any)
    const chunk = (words: string) => AiManager.processSTTChunk({ chunkWithOverlap: words, newWordsCount: words.split(" ").length })
    beforeEach(() => vi.mocked(logDetection).mockClear())

    it("has the words heard, how it was found, and that it was shown and then undone", async () => {
        found({ type: "scripture", content: "John 3:16", confidence: 98 })
        await chunk("john three sixteen")
        await settle()
        AiManager.undoChange()
        expect(lines()).toEqual([
            ["reference", "John 3:16", "shown"],
            ["reference", "John 3:16", "undone"]
        ])
        expect(vi.mocked(logDetection).mock.calls[0][0]).toMatchObject({ heard: "john three sixteen", confidence: 98 })
    })

    it("has an offer once, and the showing when the operator takes it", async () => {
        found({ type: "scripture", content: "John 3:16", confidence: 60, scriptureMatchType: "content" })
        ai.set({ enabled: true, scripture: { confidence: "ask" } } as any)
        await chunk("for god so loved")
        await chunk("loved the world")
        expect(lines()).toEqual([["quote", "John 3:16", "offered"]])
        await get(aiSuggestions)[0].trigger?.()
        expect(lines()[1]).toEqual(["quote", "John 3:16", "shown"])
        ai.set({ enabled: true, scripture: { confidence: "high" }, lyrics: { confidence: "high" } } as any)
    })

    it("has a spoken command, but not what was asked for by name", async () => {
        await AiManager.processUtterance("Back.")
        manager.lastCommand = 0
        await AiManager.navigateNow({ type: "verse-step", delta: 1 })
        await AiManager.showReference("John 3:16")
        expect(lines()).toEqual([["command", "John 3:15", "shown"]])
    })
})
