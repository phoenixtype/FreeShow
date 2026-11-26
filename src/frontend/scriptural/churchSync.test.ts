import { describe, expect, it } from "vitest"
import { pullChoice, showToSong, songSignature } from "./songFormat"

const song = { title: "Way Maker", sections: [{ label: "Chorus", type: "chorus" as const, lines: ["Way maker", "Miracle worker"] }], arrangement: ["Chorus", "Chorus"] }

describe("songSignature", () => {
    it("is the same for the same words, whatever the sections are called", () => {
        const renamed = { ...song, authors: "", sections: [{ ...song.sections[0], label: "Verse 1" }], arrangement: ["Verse 1", "Verse 1"] }
        expect(songSignature(renamed)).toBe(songSignature(song))
    })

    it("changes with a word, the title or the sung order", () => {
        const first = songSignature(song)
        expect(songSignature({ ...song, title: "Way maker!" })).not.toBe(first)
        expect(songSignature({ ...song, arrangement: ["Chorus"] })).not.toBe(first)
        expect(songSignature({ ...song, sections: [{ ...song.sections[0], lines: ["Way maker"] }] })).not.toBe(first)
    })

    it("matches the show a song becomes, so a song just sent is not taken back", () => {
        const show = { name: "Way Maker", settings: { activeLayout: "a" }, layouts: { a: { slides: [{ id: "s" }, { id: "s" }] } }, slides: { s: { group: "Chorus", items: [{ lines: [{ text: [{ value: "Way maker" }] }, { text: [{ value: "Miracle worker" }] }] }] } } }
        expect(songSignature(showToSong(show))).toBe(songSignature(song))
    })
})

describe("pullChoice", () => {
    const synced = { r: "old", l: "old" }

    it("takes a song this computer does not have", () => expect(pullChoice("new", null, undefined, true)).toBe("apply"))
    it("leaves a copy that already says the same", () => expect(pullChoice("new", "new", synced, true)).toBe("keep"))
    it("leaves this computer's look and edits alone when the library did not change", () => expect(pullChoice("old", "mine", synced, true)).toBe("keep"))
    it("takes the library's change over an untouched copy", () => expect(pullChoice("new", "old", synced, true)).toBe("apply"))
    it("waits when an edit here has not been sent yet", () => expect(pullChoice("new", "mine", synced, true)).toBe("later"))
    it("lets the library win for someone who can only view", () => expect(pullChoice("new", "mine", synced, false)).toBe("apply"))
})
