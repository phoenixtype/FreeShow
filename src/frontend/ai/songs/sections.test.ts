import { expect, it } from "vitest"
import { findSection } from "./sections"

const song = ["Verse 1", "Chorus", "Verse 2", "Chorus", "Pre-Chorus", "Bridge", "Chorus"].map((group, index) => ({ index, id: group, group }))

it("goes to the next one coming up, else the first", () => {
    expect(findSection(song, "chorus", undefined, 0)).toBe(1)
    expect(findSection(song, "chorus", undefined, 2)).toBe(3)
    expect(findSection(song, "chorus", undefined, 6)).toBe(1)
})
it("goes to one by its number", () => {
    expect(findSection(song, "verse", 2, 0)).toBe(2)
    expect(findSection(song, "verse", 3, 0)).toBeNull()
    expect(findSection(song, "refrain", undefined, -1)).toBe(1)
    expect(findSection(song, "prechorus", undefined, -1)).toBe(4)
})
it("says when the song has none", () => expect(findSection(song, "tag", undefined, 0)).toBeNull())
