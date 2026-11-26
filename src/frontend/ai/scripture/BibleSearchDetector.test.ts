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

describe("books with one chapter (B6)", () => {
    it("reads the number after one as the verse", async () => {
        expect(await heard("Jude one three")).toBe("Jude 1:3")
        expect(await heard("Philemon one six")).toBe("Philemon 1:6")
        expect(await heard("Obadiah chapter one verse fifteen")).toBe("Obadiah 1:15")
        expect(await heard("second John one six")).toBe("2 John 1:6")
        expect(await heard("third John 1 4")).toBe("3 John 1:4")
        expect(await heard("Jude 3")).toBe("Jude 1:3")
        expect(await heard("Jude one three to five")).toBe("Jude 1:3-5")
    })
})

describe("Psalms past one hundred, as they are said (B7)", () => {
    it("joins the digits", async () => {
        expect(await heard("Psalm one nineteen verse one oh five")).toBe("Psalms 119:105")
        expect(await heard("Psalm one oh three")).toBe("Psalms 103:1")
        expect(await heard("turn to Psalm one fifty")).toBe("Psalms 150:1")
        expect(await heard("Psalm one verse two")).toBe("Psalms 1:2")
    })
})

describe("a range stays inside the chapter (B8)", () => {
    it("stops at the last verse", async () => {
        expect(await heard("John 3 16 to 99")).toBe("John 3:16-36")
        expect(await heard("verses 30 to 99", "John 3:16")).toBe("John 3:30-36")
        expect(await heard("John 3 36 to 99")).toBe("John 3:36")
    })
})

describe("a chapter without its book (B11)", () => {
    it("is read in the book on screen", async () => {
        expect(await search("chapter three verse sixteen", "John 1:1")).toMatchObject({ content: "John 3:16", confidence: 80 })
        expect(await heard("and chapter three verse sixteen", "John 1:1")).toBe("John 3:16")
        expect(await heard("turn to chapter three, verse sixteen", "John 1:1")).toBe("John 3:16")
        expect(await heard("turn to chapter three", "John 1:1")).toBe("John 3:1")
    })

    it("does nothing without a book on screen, or when it is talk", async () => {
        expect(await heard("chapter three verse sixteen")).toBeUndefined()
        expect(await heard("it is a new chapter one in our lives", "John 1:1")).toBeUndefined()
        expect(await heard("and chapter three is where we struggle", "John 1:1")).toBeUndefined()
        // John has no chapter 40: not verse 2 of the chapter on screen either
        expect(await heard("chapter forty verse two", "John 1:1")).toBeUndefined()
    })

    it("takes a verse said a little after the chapter", async () => {
        expect(await heard("John chapter three and look with me at verse sixteen")).toBe("John 3:16")
    })
})

describe("a psalm named by its place (B12)", () => {
    it("is found under the Bible's own name for the book", async () => {
        expect(await heard("the twenty-third psalm")).toBe("Psalms 23:1")
        expect(await heard("turn to the 23rd psalm")).toBe("Psalms 23:1")
        expect(await heard("the hundred and nineteenth psalm")).not.toBe("Psalms 19:1")
        expect(await heard("we have read all of the one hundred and fifty psalms")).toBeUndefined()
    })
})

describe("smaller ways of saying it (B15)", () => {
    it("takes the next verse into a range", async () => {
        expect(await heard("John 3 verse 8 and nine")).toBe("John 3:8-9")
        expect(await heard("verses sixteen and seventeen", "John 3:1")).toBe("John 3:16-17")
        expect(await heard("John 3 16 and 17 years later he wrote")).toBe("John 3:16")
    })

    it("reads a verse said a digit at a time", async () => {
        expect(await heard("John three one six")).toBe("John 3:16")
    })

    it("knows other names of a book", async () => {
        expect(await heard("Song of Songs two four")).toBe("Song of Solomon 2:4")
        expect(await heard("Canticles 2:4")).toBe("Song of Solomon 2:4")
        expect(await heard("turn to the Apocalypse chapter three verse twenty")).toBe("Revelation 3:20")
    })

    it("does not split a year into chapter and verse", async () => {
        expect(await heard("Luke 2025")).toBeUndefined()
    })
})

describe("a reference does not wait for the quote search (R10)", () => {
    it("is returned at once, even if newer words have arrived", async () => {
        const detector = await testBible()
        const quotes = vi.spyOn(detector, "findContentMatch")
        let asked = 0
        const match = await detector.search("turn with me to John 3:16", "", () => asked++ > 0)
        expect(match?.content).toBe("John 3:16")
        expect(quotes).not.toHaveBeenCalled()
        quotes.mockRestore()
    })

    it("searches a short chunk once, not once per window", async () => {
        const detector = await testBible()
        const windows = vi.spyOn(detector as any, "evaluateContentMatch")
        await detector.search("for God so loved the world that he gave his only begotten son", "")
        expect(windows).toHaveBeenCalledTimes(1)
        windows.mockRestore()
    })
})
