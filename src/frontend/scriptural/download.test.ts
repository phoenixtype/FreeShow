import { describe, expect, it, vi } from "vitest"

vi.mock("../stores", () => ({ scriptures: { subscribe: () => () => {} }, scripturesCache: { subscribe: () => () => {} } }))
vi.mock("../utils/save", () => ({ save: () => {} }))
vi.mock("../converters/bebliaBible", () => ({
    defaultBibleBookNames: { 1: "Genesis", 19: "Psalm", 43: "John", 66: "Revelation" }
}))

const { bookNumber, toBible } = await import("./download")

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
