import { beforeEach, describe, expect, it, vi } from "vitest"

const screen = vi.hoisted(() => ({ current: vi.fn((): any => null) }))
vi.mock("../agent/presentPassage", () => ({ currentScripture: screen.current, otherTab: (id: string) => id }))
vi.mock("../../components/drawer/bible/scripture", () => ({
    loadJsonBible: async () => ({ data: { books: [{ number: 43, name: "John", chapters: [1, 2, 3, 4].map((number) => ({ number, verses: Array.from({ length: 36 }, (_, i) => ({ number: i + 1 })) })) }] } })
}))

import { passageStep } from "./passageStep"

const up = (verses: (number | string)[], chapter = 3) => screen.current.mockReturnValue({ id: "kjv", reference: { book: 43, chapters: [chapter], verses: [verses] } })

beforeEach(() => up([16, 17, 18]))

describe("stepping from the passage on screen", () => {
    it("goes on from the last verse of a range, and back from its first", async () => {
        expect(await passageStep({ type: "verse-step", delta: 1 })).toEqual({ reference: "43.3.19", content: "John 3:19", id: "kjv" })
        expect(await passageStep({ type: "verse-step", delta: -1 })).toMatchObject({ content: "John 3:15" })
    })

    it("carries into the next chapter", async () => {
        up(["36"])
        expect(await passageStep({ type: "verse-step", delta: 1 })).toMatchObject({ content: "John 4:1" })
    })

    it("is nowhere with no passage, or past the end of the book", async () => {
        up([36], 4)
        expect(await passageStep({ type: "verse-step", delta: 1 })).toBeNull()
        screen.current.mockReturnValue({ id: "", reference: null })
        expect(await passageStep({ type: "verse-step", delta: 1 })).toBeNull()
    })
})
