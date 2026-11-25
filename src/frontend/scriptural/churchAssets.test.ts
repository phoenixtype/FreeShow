import { describe, expect, it } from "vitest"
import { classifyFile, storageName, textSong } from "./churchAssets"

describe("classifyFile", () => {
    it("sorts a folder into songs and media, and skips the rest", () => {
        expect(classifyFile("Way Maker.txt")).toEqual({ role: "song", ext: "txt" })
        expect(classifyFile("Welcome.PNG")).toMatchObject({ role: "media", kind: "image" })
        expect(classifyFile("sermon.mp4")).toMatchObject({ role: "media", kind: "video" })
        expect(classifyFile("Easter.pptx")).toMatchObject({ role: "media", kind: "deck" })
        expect(classifyFile("order.pdf")).toMatchObject({ role: "media", kind: "pdf" })
        expect(classifyFile(".DS_Store")).toEqual({ role: "ignore" })
        expect(classifyFile("Songs.db")).toEqual({ role: "ignore" })
    })
})

describe("textSong", () => {
    it("reads labelled sections and the sung order", () => {
        const song = textSong("oceans_where_feet_may_fail.txt", "Verse 1\nYou call me out\nupon the waters\n\nChorus\nAnd I will call\nupon your name\n\nChorus\nAnd I will call\nupon your name\n")!
        expect(song.title).toBe("Oceans Where Feet May Fail")
        expect(song.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
        expect(song.arrangement).toEqual(["Verse 1", "Chorus", "Chorus"])
    })

    it("returns null for an empty file", () => {
        expect(textSong("blank.txt", " \n\n")).toBeNull()
    })
})

describe("storageName", () => {
    it("keeps a name usable as a storage path", () => {
        expect(storageName("Easter Sunday: 2026 / final?.pptx")).toBe("Easter Sunday 2026 final.pptx")
        expect(storageName("???")).toBe("file")
    })
})
