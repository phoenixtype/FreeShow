import { describe, expect, it, vi } from "vitest"

vi.mock("../stores", () => ({ scriptures: { subscribe: () => () => {} }, scripturesCache: { subscribe: () => () => {} } }))
vi.mock("../utils/save", () => ({ save: () => {} }))
vi.mock("../converters/bebliaBible", () => ({
    defaultBibleBookNames: { 1: "Genesis", 19: "Psalm", 43: "John", 66: "Revelation" }
}))

const invoke = vi.fn()
vi.mock("./connection", () => ({ churchLibrary: { getSession: () => ({}), invoke }, restGet: vi.fn(), ScripturalError: class extends Error {} }))

const { bookNumber, licensedRows, toBible } = await import("./download")

describe("a licensed version", () => {
    const version = { code: "NIV", name: "New International Version", language: "English", licensed: true }
    const rows = [{ book: "John", chapter: 3, verse: 16, text: "For God so loved the world" }]

    it("is read from the short-lived link the server hands back", async () => {
        vi.stubGlobal("localStorage", { getItem: () => "church-id" })
        const fetched = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows }) })
        vi.stubGlobal("fetch", fetched)
        invoke.mockResolvedValue({ ok: true, data: { url: "https://example.supabase.co/signed" } })

        expect(await licensedRows(version)).toEqual(rows)
        expect(invoke.mock.calls[0][1]).toEqual({ churchId: "church-id", version: "NIV", format: "url" })
        expect(fetched.mock.calls[0][0]).toBe("https://example.supabase.co/signed")
        vi.unstubAllGlobals()
    })

    it("says so when the link cannot be read", async () => {
        vi.stubGlobal("localStorage", { getItem: () => "church-id" })
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
        invoke.mockResolvedValue({ ok: true, data: { url: "https://example.supabase.co/signed" } })

        await expect(licensedRows(version)).rejects.toThrow("could not be downloaded")
        vi.unstubAllGlobals()
    })
})

describe("toBible", () => {
    it("maps Scriptural's book names to canonical numbers, Psalms included", () => {
        expect(bookNumber("Genesis")).toBe(1)
        expect(bookNumber("Psalms")).toBe(19)
        expect(bookNumber("john")).toBe(43)
        expect(bookNumber("Tobit")).toBeNull()
    })

    it("builds books, chapters and verses in canonical order whatever order rows arrive in", () => {
        const bible = toBible({ code: "KJV", name: "King James Version", language: "English" }, [
            { book: "John", chapter: 3, verse: 17, text: "For God sent not his Son" },
            { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning" },
            { book: "John", chapter: 3, verse: 16, text: "For God so loved the world" },
            { book: "Psalms", chapter: 23, verse: 1, text: "The LORD is my shepherd" },
            { book: "Tobit", chapter: 1, verse: 1, text: "skipped" },
            { book: "John", chapter: 1, verse: 1, text: "In the beginning was the Word" }
        ])

        expect(bible.books.map((b) => b.number)).toEqual([1, 19, 43])
        const john = bible.books[2]
        expect(john.chapters.map((c) => c.number)).toEqual([1, 3])
        expect(john.chapters[1].verses.map((v) => v.number)).toEqual([16, 17])
        expect(bible.metadata.identifier).toBe("KJV")
    })
})
