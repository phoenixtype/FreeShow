import { describe, expect, it, vi } from "vitest"

const load = vi.hoisted(() => vi.fn(async (_id: string): Promise<any> => null))
vi.mock("../../components/drawer/bible/scripture", () => ({ loadJsonBible: load }))
vi.mock("../../stores", async () => ({ scriptures: (await import("svelte/store")).writable(Object.fromEntries(["a", "b", "c", "d", "e"].map((id) => [id, { name: id }]))) }))

import { BibleCacheManager } from "./BibleCacheManager"

const bible = (name = "John") => ({ data: { books: [{ number: 43, name, chapters: [{ number: 3, verses: [{ number: 1, text: "There was a man of the Pharisees" }] }] }] } })

describe("a Bible that would not load (C3)", () => {
    it("is tried again", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        load.mockResolvedValueOnce(null)
        expect(await BibleCacheManager.getCache("a")).toBeNull()
        load.mockRejectedValueOnce(new Error("disk busy"))
        expect(await BibleCacheManager.getCache("a")).toBeNull()
        load.mockResolvedValueOnce(bible())
        expect(await BibleCacheManager.getCache("a")).not.toBeNull()
    })

    it("copes with a book name full of symbols", async () => {
        load.mockResolvedValueOnce(bible("Psalms (a+b) [draft"))
        const detector = await BibleCacheManager.getCache("b")
        expect(detector?.findReference("john 3 1") ?? null).toBeNull()
    })
})

describe("memory (R10)", () => {
    it("keeps the Bible in use and two more", async () => {
        load.mockImplementation(async () => bible())
        for (const id of ["c", "d", "e"]) await BibleCacheManager.getCache(id)
        await BibleCacheManager.getCache("c")
        await BibleCacheManager.getCache("a")
        expect(BibleCacheManager.loadedIds()).toEqual(["e", "c", "a"])
        const loads = load.mock.calls.length
        await BibleCacheManager.getCache("c")
        expect(load.mock.calls.length).toBe(loads)
        await BibleCacheManager.getCache("d")
        expect(load.mock.calls.length).toBe(loads + 1)
    })
})
