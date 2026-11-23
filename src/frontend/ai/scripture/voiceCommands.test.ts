import { describe, it, expect } from "vitest"
import { parseCopilotCommand } from "./voiceCommands"

describe("parseCopilotCommand", () => {
    it("matches explicit verse-step phrases anywhere in an utterance", () => {
        expect(parseCopilotCommand("next verse")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("let's read the next verse together")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("Next verse, please.")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("previous verse")).toEqual({ type: "verse-step", delta: -1 })
        expect(parseCopilotCommand("can we see the previous verse")).toEqual({ type: "verse-step", delta: -1 })
        expect(parseCopilotCommand("go back a verse")).toEqual({ type: "verse-step", delta: -1 })
    })

    it("matches bare commands only as the whole utterance", () => {
        expect(parseCopilotCommand("next")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("Next.")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("go next")).toEqual({ type: "verse-step", delta: 1 })
        expect(parseCopilotCommand("back")).toEqual({ type: "verse-step", delta: -1 })
        expect(parseCopilotCommand("go back")).toEqual({ type: "verse-step", delta: -1 })
        expect(parseCopilotCommand("previous")).toEqual({ type: "verse-step", delta: -1 })
    })

    it("ignores bare command words embedded in ordinary speech", () => {
        expect(parseCopilotCommand("the next day Jesus went to Galilee")).toBeNull()
        expect(parseCopilotCommand("back in Egypt the people cried out")).toBeNull()
        expect(parseCopilotCommand("turn back to God")).toBeNull()
        expect(parseCopilotCommand("what happens next in the story")).toBeNull()
    })

    it("understands beginning-of-book commands", () => {
        expect(parseCopilotCommand("go to the beginning")).toEqual({ type: "first-chapter" })
        expect(parseCopilotCommand("let's go to the beginning")).toEqual({ type: "first-chapter" })
        expect(parseCopilotCommand("from the beginning")).toEqual({ type: "first-chapter" })
        expect(parseCopilotCommand("first chapter")).toEqual({ type: "first-chapter" })
        expect(parseCopilotCommand("beginning")).toEqual({ type: "first-chapter" })
        expect(parseCopilotCommand("the beginning")).toEqual({ type: "first-chapter" })
    })

    it("understands first/last verse commands", () => {
        expect(parseCopilotCommand("go to first verse")).toEqual({ type: "first-verse" })
        expect(parseCopilotCommand("first verse")).toEqual({ type: "first-verse" })
        expect(parseCopilotCommand("start of the chapter")).toEqual({ type: "first-verse" })
        expect(parseCopilotCommand("last verse")).toEqual({ type: "last-verse" })
        expect(parseCopilotCommand("go to the end of the chapter")).toEqual({ type: "last-verse" })
    })

    it("understands chapter commands", () => {
        expect(parseCopilotCommand("last chapter")).toEqual({ type: "last-chapter" })
        expect(parseCopilotCommand("go to the last chapter")).toEqual({ type: "last-chapter" })
        expect(parseCopilotCommand("final chapter")).toEqual({ type: "last-chapter" })
        expect(parseCopilotCommand("next chapter")).toEqual({ type: "chapter-step", delta: 1 })
        expect(parseCopilotCommand("previous chapter")).toEqual({ type: "chapter-step", delta: -1 })
    })

    it("understands go-to jumps with digits and number words", () => {
        expect(parseCopilotCommand("go to verse 5")).toEqual({ type: "goto-verse", verse: 5 })
        expect(parseCopilotCommand("go to verse twenty three")).toEqual({ type: "goto-verse", verse: 23 })
        expect(parseCopilotCommand("go to chapter 3")).toEqual({ type: "goto-chapter", chapter: 3 })
        expect(parseCopilotCommand("go to chapter three verse sixteen")).toEqual({ type: "goto-chapter", chapter: 3, verse: 16 })
        expect(parseCopilotCommand("go back to verse one hundred nineteen")).toEqual({ type: "goto-verse", verse: 119 })
    })

    it("matches bare verse/chapter jumps only as the whole utterance", () => {
        expect(parseCopilotCommand("verse 5")).toEqual({ type: "goto-verse", verse: 5 })
        expect(parseCopilotCommand("chapter 2")).toEqual({ type: "goto-chapter", chapter: 2 })
        expect(parseCopilotCommand("chapter 2 verse 4")).toEqual({ type: "goto-chapter", chapter: 2, verse: 4 })
        expect(parseCopilotCommand("in verse 5 Paul says something")).toBeNull()
        expect(parseCopilotCommand("chapter 2 tells us about creation")).toBeNull()
    })

    it("ignores ordinary speech and empty input", () => {
        expect(parseCopilotCommand("for God so loved the world")).toBeNull()
        expect(parseCopilotCommand("")).toBeNull()
        expect(parseCopilotCommand("   ")).toBeNull()
    })

    it("ignores incidental version mentions", () => {
        expect(parseCopilotCommand("the king james translators were careful")).toBeNull()
        expect(parseCopilotCommand("the message of the gospel is grace")).toBeNull()
    })

    it("leaves spoken references to scripture detection", () => {
        expect(parseCopilotCommand("show me John 3:16 in the NIV")).toBeNull()
        expect(parseCopilotCommand("go to chapter 3 in the NIV")).toEqual({ type: "goto-chapter", chapter: 3 })
    })
})
