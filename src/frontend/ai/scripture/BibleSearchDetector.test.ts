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
