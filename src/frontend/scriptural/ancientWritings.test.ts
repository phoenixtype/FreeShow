import { readFileSync } from "fs"
import { join } from "path"
import JsonBible from "json-bible"
import { get } from "svelte/store"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { scriptures: writable({}), scripturesCache: writable({}) }
})
vi.mock("../utils/save", () => ({ save: vi.fn() }))

const { scriptures, scripturesCache } = await import("../stores")
const { addAncientWritings } = await import("./ancientWritings")
const { ancientId, bookFitsBible, isAncientWritings, listeningBibleId, refusesReference } = await import("./ancientRules")

const data = JSON.parse(readFileSync(join(__dirname, "../../../public/ancient-writings.json"), "utf8"))

beforeEach(() => {
    scriptures.set({})
    scripturesCache.set({})
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => structuredClone(data) }))
    )
})

describe("the books shipped in the app", () => {
    it("are all public domain, with translation, source and warning kept", () => {
        expect(data.books).toHaveLength(36)
        for (const book of data.books) {
            expect(book.license).toMatch(/^Public domain/)
            expect(book.translation && book.source && book.warning).toBeTruthy()
            expect(book.chapters.every((c: any) => c.verses.every((v: any) => v.text && !v.text.includes("<")))).toBe(true)
        }
    })

    it("list the Apocrypha first, numbered where no Bible book is", () => {
        const groups = data.books.map((b: any) => b.group)
        expect(groups.lastIndexOf("Apocrypha")).toBeLessThan(groups.indexOf("Other writings"))
        expect(data.books.map((b: any) => b.number)).toEqual(data.books.map((_: any, i: number) => 201 + i))
        expect(new Set(data.books.map((b: any) => b.abbreviation)).size).toBe(36)
    })

    it("give the Additions to Esther their true chapter and verse numbers", () => {
        const esther = data.books.find((b: any) => b.name === "Additions to Esther")
        expect(esther.chapters.map((c: any) => c.number)).toEqual([10, 11, 12, 13, 14, 15, 16])
        expect(esther.chapters[0].verses.map((v: any) => v.number)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
        expect(esther.chapters[1].verses[0].number).toBe(1)
    })
})

describe("reading them with the app's Bible reader", () => {
    it("finds a verse by book, chapter and verse, and keeps each book's warning", async () => {
        const bible = await JsonBible(structuredClone(data))
        const found = bible.bookSearch("Tobit 4:7")
        const book = await bible.getBook(found.book)
        const chapter = await book.getChapter(4)

        expect(chapter.getVerse(7).getText()).toContain("alms")
        expect((book.data as any).warning).toContain("Not in the Protestant canon")

        const esther = await bible.getBook("Additions to Esther")
        expect((await esther.getChapter(10)).getVerse(4).getText()).toContain("God hath done these things")
    })
})

describe("adding them", () => {
    it("puts one local Bible in the list, once however often it is pressed", async () => {
        const first = await addAncientWritings()
        const second = await addAncientWritings()

        expect(second).toBe(first)
        expect(Object.values(get(scriptures))).toEqual([{ name: "Other ancient writings", id: first, ancientWritings: true }])
        expect(get(scripturesCache)[first].books).toHaveLength(36)
        expect(ancientId()).toBe(first)
    })

    it("can be added again after being removed", async () => {
        await addAncientWritings()
        scriptures.set({})
        expect(ancientId()).toBeNull()
        await addAncientWritings()
        expect(ancientId()).not.toBeNull()
    })

    it("says so when the books cannot be read", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false }))
        )
        await expect(addAncientWritings()).rejects.toThrow()
        expect(get(scriptures)).toEqual({})
    })
})

describe("kept apart from the Bibles", () => {
    beforeEach(() => scriptures.set({ old: { name: "Other ancient writings", ancientWritings: true }, kjv: { name: "KJV" }, both: { name: "x", collection: { versions: ["old", "kjv"] } } } as any))

    it("is never the Bible that listening reads", () => {
        expect(isAncientWritings("old")).toBe(true)
        expect(isAncientWritings("both")).toBe(true)
        expect(listeningBibleId("old")).toBe("kjv")
        expect(listeningBibleId("kjv")).toBe("kjv")
        scriptures.set({ old: { name: "x", ancientWritings: true } } as any)
        expect(listeningBibleId("old")).toBe("")
    })

    it("takes a number picked on the phone remote, never a named reference", () => {
        expect(refusesReference("old", "201.4.7")).toBe(false)
        expect(refusesReference("old", "Tobit 4:7")).toBe(true)
        expect(refusesReference("old", "43.3.16")).toBe(true)
        expect(refusesReference("kjv", "201.4.7")).toBe(true)
        expect(refusesReference("kjv", "43.3.16")).toBe(false)
        expect(refusesReference("kjv", "John 3:16")).toBe(false)
    })

    it("lets no reference cross between a Bible and these books", () => {
        expect(bookFitsBible("old", 43)).toBe(false)
        expect(bookFitsBible("old", 201)).toBe(true)
        expect(bookFitsBible("kjv", 201)).toBe(false)
        expect(bookFitsBible("kjv", 43)).toBe(true)
    })
})
