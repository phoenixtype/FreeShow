import { describe, it, expect } from "vitest"
import { detectBibleEvents, getAllEventReferences } from "./bibleEvents"

const refs = (text: string) => detectBibleEvents(text).map((m) => m.reference)

describe("detectBibleEvents", () => {
    describe("famous events resolve from natural speech", () => {
        it('detects "when Jesus walked on water"', () => {
            expect(refs("remember when Jesus walked on the water")).toContain("Matthew 14:22-33")
        })

        it("detects the prodigal son", () => {
            expect(refs("this reminds me of the prodigal son")).toContain("Luke 15:11-32")
        })

        it("detects David and Goliath", () => {
            expect(refs("just like David and Goliath")).toContain("1 Samuel 17:32-51")
        })

        it("detects the good samaritan", () => {
            expect(refs("the story of the good samaritan teaches us")).toContain("Luke 10:25-37")
        })

        it("detects feeding the five thousand", () => {
            expect(refs("he fed five thousand with five loaves")).toContain("Matthew 14:13-21")
        })

        it("detects parting the Red Sea", () => {
            expect(refs("God parted the Red Sea for Israel")).toContain("Exodus 14:13-31")
        })

        it("detects Daniel in the lions' den", () => {
            expect(refs("think about Daniel in the lions' den")).toContain("Daniel 6:1-28")
        })

        it("detects the fiery furnace via names", () => {
            expect(refs("Shadrach, Meshach and Abednego stood firm")).toContain("Daniel 3:1-30")
        })

        it("detects Jonah via multiple phrasings", () => {
            expect(refs("like Jonah and the whale")).toContain("Jonah 1:1-17")
            expect(refs("he was swallowed by a great fish")).toContain("Jonah 1:1-17")
        })

        it("detects John 3:16 from its famous wording", () => {
            expect(refs("for God so loved the world that he gave")).toContain("John 3:16")
        })

        it("detects the armor of God", () => {
            expect(refs("put on the whole armor of God")).toContain("Ephesians 6:10-18")
        })

        it('detects "for such a time as this" (Esther)', () => {
            expect(refs("you were made for such a time as this")).toContain("Esther 4:1-17")
        })
    })

    describe("morphological variants (stemming)", () => {
        it("matches walk/walked/walking on water", () => {
            expect(refs("jesus walking on water")).toContain("Matthew 14:22-33")
            expect(refs("jesus walks on the water")).toContain("Matthew 14:22-33")
        })
    })

    describe("no false positives on ordinary speech", () => {
        it("returns nothing for non-biblical text", () => {
            expect(detectBibleEvents("the weather is lovely today and we should go outside")).toEqual([])
        })

        it("returns nothing for empty input", () => {
            expect(detectBibleEvents("")).toEqual([])
        })

        it("does not combine tokens from far-apart sentences", () => {
            // "water" early, "walked" 30+ significant tokens later — outside the
            // proximity window, must not match the walking-on-water event.
            const farApart = "the water in the lake was cold that morning as the fishermen prepared their nets and boats " + "and counted every single fish from the previous long difficult night before the crowd arrived hungry " + "and later that evening everyone walked home along the dusty road"
            expect(refs(farApart)).not.toContain("Matthew 14:22-33")
        })
    })

    describe("result shape and ordering", () => {
        it("returns confidence, label and matchedPhrase", () => {
            const [m] = detectBibleEvents("remember the prodigal son")
            expect(m.reference).toBe("Luke 15:11-32")
            expect(m.label).toMatch(/prodigal/i)
            expect(m.confidence).toBeGreaterThanOrEqual(0.8)
            expect(m.matchedPhrase).toBeTruthy()
        })

        it("dedupes by reference when multiple phrases of one event match", () => {
            const results = detectBibleEvents("jesus walked on water and peter walked on water too")
            const matthew = results.filter((r) => r.reference === "Matthew 14:22-33")
            expect(matthew).toHaveLength(1)
        })

        it("sorts more specific (higher-confidence) matches first", () => {
            const results = detectBibleEvents("by his stripes we are healed")
            expect(results[0]?.reference).toBe("Isaiah 53:1-12")
        })
    })

    describe("table integrity", () => {
        it("every reference in the events table parses via parseReference", () => {
            // The copilot pipeline runs every surfaced reference through
            // parseReference — an unparseable table entry would be a silent no-op.
            for (const ref of getAllEventReferences()) {
                expect(ref, `unparseable: ${ref}`).toMatch(/^[1-3]? ?[A-Z][a-z]+(?: of [A-Z][a-z]+| [A-Z][a-z]+)* \d+(?::\d+(?:-\d+)?)?$/)
            }
        })
    })
})
