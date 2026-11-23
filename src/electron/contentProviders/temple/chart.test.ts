import { describe, expect, it } from "vitest"
import { templeChartSections } from "./chart"

describe("templeChartSections", () => {
    it("reads {c:} comment markers and keeps chords inline", () => {
        const chart = "{title: Amazing Grace}\n{key: G}\n{c: Verse 1}\n[G]Amazing [C]grace\nhow [G]sweet the sound\n\n{c: Chorus}\nMy chains are gone"
        expect(templeChartSections(chart)).toEqual([
            { label: "Verse 1", lyrics: "[G]Amazing [C]grace\nhow [G]sweet the sound" },
            { label: "Chorus", lyrics: "My chains are gone" }
        ])
    })

    it("reads start_of blocks, [Label] lines and bare labels", () => {
        const chart = "{start_of_chorus}\nHallelujah\n{end_of_chorus}\n[Bridge]\nOh the blood\nVerse 2:\nNew words"
        expect(templeChartSections(chart).map((s) => s.label)).toEqual(["Chorus", "Bridge", "Verse 2"])
    })

    it("splits a chart with no markers into numbered verses at blank lines", () => {
        expect(templeChartSections("line one\nline two\n\n\nline three")).toEqual([
            { label: "Verse 1", lyrics: "line one\nline two" },
            { label: "Verse 2", lyrics: "line three" }
        ])
    })

    it("keeps the label for a second stanza and drops band notes", () => {
        const chart = "{c: Chorus}\nfirst half\n\nsecond half\n{c: x2 softly}"
        expect(templeChartSections(chart)).toEqual([
            { label: "Chorus", lyrics: "first half" },
            { label: "Chorus", lyrics: "second half" }
        ])
    })

    it("does not mistake a chord line in brackets for a label", () => {
        expect(templeChartSections("[G] [C] [D]\nwords")[0].lyrics).toBe("[G] [C] [D]\nwords")
    })

    it("returns nothing for an empty chart", () => {
        expect(templeChartSections(null)).toEqual([])
        expect(templeChartSections("{title: Only a title}")).toEqual([])
    })
})
