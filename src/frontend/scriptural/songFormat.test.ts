import { describe, expect, it } from "vitest"
import { cleanEasyWorshipSong, easyWorshipSlides, readLabel, showToSong, tidyLine, tidyTitle, toSections } from "./songFormat"

const rtf = (body: string) => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil Arial;}}{\\colortbl\\red0\\green0\\blue0;}${body}}`
const par = (text: string) => `\\li0\\fi0\\ri0\\sb0\\sl\\sa0 \\plain\\f1 ${text}\\par\n`

describe("readLabel", () => {
    it("reads the labels songs are written with", () => {
        expect(readLabel("Verse 2:")).toEqual({ type: "verse", name: "Verse", number: 2 })
        expect(readLabel("CHORUS")).toEqual({ type: "chorus", name: "Chorus", number: undefined })
        expect(readLabel("Pre-Chorus")?.type).toBe("pre-chorus")
        expect(readLabel("V1")).toEqual({ type: "verse", name: "Verse", number: 1 })
        expect(readLabel("Bridge")?.type).toBe("bridge")
    })

    it("leaves lyric lines alone", () => {
        expect(readLabel("Verse of my heart")).toBeNull()
        expect(readLabel("Way maker, miracle worker")).toBeNull()
        expect(readLabel("Chorus of angels singing")).toBeNull()
    })
})

describe("tidyLine", () => {
    it("puts capital-letter lines in sentence case, keeping names of God and places", () => {
        expect(tidyLine("AMEN AMEN WE BIND THE DEVIL")).toBe("Amen amen we bind the devil")
        expect(tidyLine("POWER AND MIGHT BELONG TO THE LORD")).toBe("Power and might belong to the Lord")
        expect(tidyLine("(KING OF ZION, I WORSHIP JESUS)")).toBe("(King of Zion, I worship Jesus)")
        expect(tidyLine("  way  maker ")).toBe("Way maker")
        expect(tidyLine("Oba gbo gbo aye")).toBe("Oba gbo gbo aye")
    })
})

describe("tidyTitle", () => {
    it("title-cases titles typed in one case, keeps mixed ones", () => {
        expect(tidyTitle("kadosh kadosh kadosh")).toBe("Kadosh Kadosh Kadosh")
        expect(tidyTitle("GREAT IS THY FAITHFULNESS")).toBe("Great Is Thy Faithfulness")
        expect(tidyTitle("  I won't settle for less  ")).toBe("I won't settle for less")
        expect(tidyTitle("the god of the mountain")).toBe("The God of the Mountain")
        expect(tidyTitle("Worthy is the Lamb Who is seated on the throne We worship and adore You We lift Your name on high")).toBe("Worthy is the Lamb Who is seated on the throne We worship")
    })
})

describe("easyWorshipSlides", () => {
    it("keeps line breaks, splits slides on blank paragraphs, decodes characters", () => {
        const words = rtf(`{\\pard${par("verse")}${"\\li0 \\plain\\f1 Behold He comes,\\line \\plain\\f1 Riding on the clouds,\\par\n"}${par("")}${"\\plain\\f1 chorus\\line \\plain\\f1 It\\u8217?s the year of Jubilee\\line }"}`)
        expect(easyWorshipSlides(words)).toEqual([
            ["verse", "Behold He comes,", "Riding on the clouds,"],
            ["chorus", "It’s the year of Jubilee"]
        ])
    })
})

describe("toSections", () => {
    it("labels sections, numbers verses, stores a repeated chorus once", () => {
        const { sections, arrangement } = toSections([
            ["Verse 1", "first line"],
            ["Chorus", "hallelujah"],
            ["Verse 2", "second verse line"],
            ["CHORUS", "Hallelujah"]
        ])
        expect(sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2"])
        expect(sections[0].lines).toEqual(["First line"])
        expect(arrangement).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"])
    })

    it("calls the most repeated unlabelled part the chorus when none is named", () => {
        const { sections, arrangement } = toSections([["first verse"], ["we lift you high"], ["second verse"], ["we lift you high"]])
        expect(arrangement).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"])
        expect(sections.find((x) => x.type === "chorus")?.lines).toEqual(["We lift you high"])
    })

    it("numbers unlabelled slides as verses", () => {
        const { sections, arrangement } = toSections([["one"], ["two"]])
        expect(arrangement).toEqual(["Verse 1", "Verse 2"])
        expect(sections[1].lines).toEqual(["Two"])
    })
})

describe("cleanEasyWorshipSong", () => {
    it("keeps the credits and the CCLI number", () => {
        const song = cleanEasyWorshipSong({ title: "WAY MAKER", author: " Sinach ", reference_number: "CCLI #7115744" }, rtf(`{\\pard${par("Verse")}${par("You are here")}}`))
        expect(song.title).toBe("Way Maker")
        expect(song.authors).toBe("Sinach")
        expect(song.ccli).toBe("7115744")
        expect(song.sections[0].label).toBe("Verse 1")
    })
})

describe("showToSong", () => {
    const text = (value: string) => ({ lines: value.split("\n").map((v) => ({ text: [{ value: v }] })) })
    it("turns groups into sections and the layout into the sung order", () => {
        const song = showToSong({
            name: "Way Maker",
            settings: { activeLayout: "L" },
            layouts: { L: { slides: [{ id: "a" }, { id: "b" }, { id: "a" }] } },
            slides: {
                a: { group: "Verse", items: [text("You are here\nMoving in our midst")] },
                b: { group: "Chorus", children: ["c"], items: [text("Way maker")] },
                c: { group: null, items: [text("Promise keeper")] }
            },
            meta: { author: "Sinach", CCLI: "7115744" }
        })
        expect(song.sections).toEqual([
            { label: "Verse 1", type: "verse", lines: ["You are here", "Moving in our midst"] },
            { label: "Chorus", type: "chorus", lines: ["Way maker", "Promise keeper"] }
        ])
        expect(song.arrangement).toEqual(["Verse 1", "Chorus", "Verse 1"])
        expect(song.ccli).toBe("7115744")
    })
})
