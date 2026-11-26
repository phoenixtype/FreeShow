// Listening never searches the other ancient writings: a verse from them goes on
// screen only when the operator picks it.

import { beforeEach, describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn())
vi.mock("../../components/drawer/bible/scripture", () => ({
    loadJsonBible: load,
    resolveScriptureReference: vi.fn(async () => ({ book: 43, chapter: 3, verses: [16] })),
    sanitizeVerseText: (text: string) => text,
    getShortBibleName: (name: string) =>
        name
            .split(" ")
            .map((w) => w[0])
            .join("")
}))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { scriptures: writable({}), drawerTabsData: writable({}) }
})

vi.mock("../../components/helpers/array", () => ({ keysToID: (list: any) => Object.entries(list).map(([id, value]: any) => ({ ...value, id })) }))
vi.mock("../../converters/txt", () => ({ similarity: (a: string, b: string) => (a === b ? 1 : 0) }))

const { drawerTabsData, scriptures } = await import("../../stores")
const { BibleCacheManager } = await import("./BibleCacheManager")
const { detectBibleVersion } = await import("./BibleVersionDetector")
const { readPassage } = await import("./passage")

const quote = "Give alms of thy substance and when thou givest alms let not thine eye be envious"
const tobit = { data: { books: [{ number: 201, name: "Tobit", chapters: [{ number: 4, verses: [{ number: 7, text: quote }] }] }] } }
const verses = [{ number: 16, text: "For God so loved the world" }]
const john = { data: { books: [{ number: 43, name: "John", chapters: [{ number: 3, verses }] }] }, getBook: async () => ({ name: "John", getChapter: async () => ({ data: { verses } }) }) }

beforeEach(() => {
    load.mockReset()
    load.mockImplementation(async (id: string) => (id === "old" ? tobit : john))
    scriptures.set({ old: { id: "old", name: "Other ancient writings", ancientWritings: true }, kjv: { id: "kjv", name: "King James Version" } } as any)
    drawerTabsData.set({ scripture: { activeSubTab: "old" } } as any)
})

describe("other ancient writings", () => {
    it("are never loaded to search for a quote or a reference, even when open", async () => {
        expect(await BibleCacheManager.getCache("old")).toBeNull()
        vi.stubGlobal("window", {})
        BibleCacheManager.preloadAllInBackground(["old"])
        await new Promise((resolve) => setTimeout(resolve, 150))
        expect(load).not.toHaveBeenCalled()
        expect(BibleCacheManager.loadedIds()).not.toContain("old")
    })

    it("are not known by the built-in list of references", async () => {
        const canon = await BibleCacheManager.getCanon()
        expect(canon.findReference("Tobit chapter four verse seven")).toBeNull()
        expect(await canon.search(quote, "")).toBeNull()
    })

    it("are not a version that can be heard and switched to", async () => {
        drawerTabsData.set({ scripture: { activeSubTab: "kjv" } } as any)
        expect(await detectBibleVersion("read that from the other ancient writings")).toBeNull()
        expect(await detectBibleVersion("open the OAW translation")).toBeNull()
    })

    it("are never where a heard passage is read from", async () => {
        expect((await readPassage("John 3:16"))?.version).toBe("King James Version")
        expect((await readPassage("Tobit 4:7", "old"))?.version).toBe("King James Version")
        expect(load).not.toHaveBeenCalledWith("old")
        scriptures.set({ old: { id: "old", name: "Other ancient writings", ancientWritings: true } } as any)
        expect(await readPassage("John 3:16")).toBeNull()
    })
})
