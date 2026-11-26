// A false verse on a church screen is the worst thing this can do. Every sentence here is
// something a preacher says: it either means exactly one verse, or it means nothing.
import { describe, expect, it, vi } from "vitest"
vi.mock("../../components/drawer/bible/scripture", () => ({ loadJsonBible: async () => null }))
vi.mock("../../stores", async () => ({ scriptures: (await import("svelte/store")).writable({}) }))

import { testBible } from "./testBible"

const search = async (words: string, live = "") => (await testBible()).search(words, live)
const heard = async (words: string, live = "") => (await search(words, live))?.content

describe("a number is not a verse cue (B2)", () => {
    it("is not moved on by ordinary words", async () => {
        expect(await heard("he came by night for God was with him", "John 3:2")).not.toBe("John 3:4")
        expect(await heard("wait a second", "John 3:1")).toBeUndefined()
        expect(await heard("there are two kinds of people in this room", "John 3:1")).toBeUndefined()
        expect(await heard("and so I say. two things matter to me this morning", "John 3:1")).toBeUndefined()
    })

    it("follows a reader who says the number and then the verse", async () => {
        const match = await search("except God be with him. three Jesus answered and said", "John 3:2")
        expect(match?.content).toBe("John 3:3")
        expect(match?.confidence).toBe(85)
    })

    it("only offers a bare number when the Bible has no words to check", async () => {
        const match = await search("and it came to pass. three", "Genesis 1:2")
        expect(match).toMatchObject({ content: "Genesis 1:3", confidence: 70 })
    })
})

describe("ordinary words stay ordinary (B3)", () => {
    it("does not read them as book names", async () => {
        expect(await heard("thank Mark for five years")).toBeUndefined()
        expect(await heard("let me ask three questions")).toBeUndefined()
        expect(await heard("we will ask three")).toBeUndefined()
        expect(await heard("Dan is going to give 2 announcements")).toBeUndefined()
        expect(await heard("the exit is on your left, row 3")).toBeUndefined()
    })

    it("still reads a mishearing that is followed by a number", async () => {
        expect(await heard("turn to rev 3:20")).toBe("Revelation 3:20")
        expect(await heard("open romance chapter 8 verse 28")).toBe("Romans 8:28")
        expect(await heard("1 cor 13:4")).toBe("1 Corinthians 13:4")
    })
})

describe("a book name and a number is not always a chapter (B4)", () => {
    it("does nothing when the number is part of the sentence", async () => {
        expect(await heard("John once said that we should pray")).toBeUndefined()
        expect(await heard("Mark two things today")).toBeUndefined()
        expect(await heard("Mark two things")).toBeUndefined()
        expect(await heard("we gave James 3 more chances after that")).toBeUndefined()
        expect(await heard("in Acts 2 of the apostles' prayers were answered")).toBeUndefined()
    })

    it("still goes to a chapter that is plainly meant", async () => {
        expect(await heard("turn to John 3")).toBe("John 3:1")
        expect(await heard("John chapter 3 and let us pray")).toBe("John 3:1")
        expect(await heard("we are reading Romans 8 this morning")).toBe("Romans 8:1")
        expect(await heard("the eighth chapter of Romans tells us")).toBe("Romans 8:1")
        expect(await heard("John 3")).toBe("John 3:1")
    })

    it("reads number words of another language only when it is spoken", async () => {
        const detector = await testBible()
        expect((await detector.search("turn to John once", "", undefined, "es"))?.content).toBe("John 11:1")
        expect(await heard("turn to John once")).toBeUndefined()
    })
})

describe("a number before a book (B5)", () => {
    it("is not part of the name when a pause follows it", async () => {
        expect(await search("First, John 3:16 tells us")).toMatchObject({ content: "John 3:16", confidence: 74 })
        expect(await search("number one, John 3 verse 16")).toMatchObject({ content: "John 3:16", confidence: 74 })
        expect(await heard("first, corinthians 13 verse 4")).toBe("1 Corinthians 13:4")
    })

    it("is part of the name when it is said as one", async () => {
        expect(await heard("1st John 1:9")).toBe("1 John 1:9")
        expect(await heard("II Corinthians 5:17")).toBe("2 Corinthians 5:17")
        expect(await heard("III John 1:4")).toBe("3 John 1:4")
        expect(await heard("first John chapter one verse nine")).toBe("1 John 1:9")
    })

    it("is dropped when the numbered book has no such place", async () => {
        expect(await heard("the first John 21 verse 15")).toBe("John 21:15")
    })
})
