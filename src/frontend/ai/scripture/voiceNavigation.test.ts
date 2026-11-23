import { describe, expect, it } from "vitest"
import { resolveNavigation } from "./voiceNavigation"

// A three-chapter book: 5, 3 and 4 verses.
const book = { chapterCount: 3, verseCount: (c: number) => [0, 5, 3, 4][c] ?? 0 }

describe("resolveNavigation", () => {
    it("steps verses and crosses chapter edges", () => {
        expect(resolveNavigation({ type: "verse-step", delta: 1 }, { chapter: 1, verse: 2 }, book)).toEqual({ chapter: 1, verse: 3 })
        expect(resolveNavigation({ type: "verse-step", delta: 1 }, { chapter: 1, verse: 5 }, book)).toEqual({ chapter: 2, verse: 1 })
        expect(resolveNavigation({ type: "verse-step", delta: -1 }, { chapter: 2, verse: 1 }, book)).toEqual({ chapter: 1, verse: 5 })
    })

    it("stops at the ends of the book", () => {
        expect(resolveNavigation({ type: "verse-step", delta: -1 }, { chapter: 1, verse: 1 }, book)).toBeNull()
        expect(resolveNavigation({ type: "verse-step", delta: 1 }, { chapter: 3, verse: 4 }, book)).toBeNull()
        expect(resolveNavigation({ type: "chapter-step", delta: 1 }, { chapter: 3, verse: 2 }, book)).toBeNull()
    })

    it("jumps within the chapter and the book", () => {
        expect(resolveNavigation({ type: "last-verse" }, { chapter: 2, verse: 1 }, book)).toEqual({ chapter: 2, verse: 3 })
        expect(resolveNavigation({ type: "first-verse" }, { chapter: 2, verse: 3 }, book)).toEqual({ chapter: 2, verse: 1 })
        expect(resolveNavigation({ type: "first-chapter" }, { chapter: 3, verse: 2 }, book)).toEqual({ chapter: 1, verse: 1 })
        expect(resolveNavigation({ type: "last-chapter" }, { chapter: 1, verse: 2 }, book)).toEqual({ chapter: 3, verse: 1 })
        expect(resolveNavigation({ type: "goto-chapter", chapter: 2, verse: 3 }, { chapter: 1, verse: 1 }, book)).toEqual({ chapter: 2, verse: 3 })
    })

    it("refuses verses that do not exist and moves that go nowhere", () => {
        expect(resolveNavigation({ type: "goto-verse", verse: 9 }, { chapter: 2, verse: 1 }, book)).toBeNull()
        expect(resolveNavigation({ type: "goto-chapter", chapter: 7 }, { chapter: 1, verse: 1 }, book)).toBeNull()
        expect(resolveNavigation({ type: "goto-verse", verse: 2 }, { chapter: 1, verse: 2 }, book)).toBeNull()
    })
})
