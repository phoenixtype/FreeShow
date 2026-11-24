import { describe, expect, it } from "vitest"
import { MIN_EVIDENCE, PRESENT_EVIDENCE, quoteEvidence } from "./quoteEvidence"

// idf values as measured over the King James Version
const word = (text: string, idf: number) => ({ word: text, idf })

describe("quoteEvidence", () => {
    it("ignores ordinary talk that shares words with a verse", () => {
        // "be able to should be it should be able to um work I" was Ecclesiastes 8:17
        expect(quoteEvidence([word("be", 1.6), word("able", 5.2), word("to", 1), word("it", 1.6), word("work", 4.4)], 3)).toBeLessThan(MIN_EVIDENCE)
        // "I am going to ask the" was Judges 19:18 at 98
        expect(quoteEvidence([word("am", 3.4), word("going", 6), word("to", 1), word("ask", 5)], 3)).toBeLessThan(MIN_EVIDENCE)
        // "let me tell you the truth" was John 8:45
        expect(quoteEvidence([word("me", 2), word("tell", 4.9), word("you", 2.6), word("truth", 5)], 4)).toBeLessThan(MIN_EVIDENCE)
    })

    it("accepts a verse of telling words", () => {
        expect(quoteEvidence([word("lord", 1.6), word("is", 1.5), word("my", 2), word("shepherd", 6.8), word("shall", 1.4), word("not", 1.7), word("want", 6.2)], 8)).toBeGreaterThanOrEqual(PRESENT_EVIDENCE)
        expect(quoteEvidence([word("weeping", 6.7), word("may", 3.5), word("endure", 6.8)], 3)).toBeGreaterThanOrEqual(PRESENT_EVIDENCE)
    })

    it("accepts plain words when they run on in the verse's own order", () => {
        // "be still and know that I am God"
        expect(quoteEvidence([word("be", 1.6), word("still", 6), word("and", 0.4), word("know", 3.5), word("that", 1), word("am", 3.4), word("god", 2.1)], 7)).toBeGreaterThanOrEqual(MIN_EVIDENCE)
    })
})
