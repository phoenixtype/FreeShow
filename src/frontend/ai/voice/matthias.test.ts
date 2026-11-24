import { describe, expect, it } from "vitest"
import { findCalls, matchTitle, parseRequest } from "./matthias"

const calls = (words: string) => findCalls(words).map((c) => c.request)

describe("findCalls", () => {
    it("hears the name and what follows", () => {
        expect(calls("And that is why we trust him. Matthias, show John three sixteen.")).toEqual(["show John three sixteen."])
        expect(calls("hey Matias next verse")).toEqual(["next verse"])
        expect(calls("Let us stand Mathias clear the screen Matthias next verse")).toEqual(["clear the screen", "next verse"])
        expect(calls("okay Matthias")).toEqual([""])
    })
    it("does not answer when Matthias is only spoken about", () => {
        expect(calls("and the lot fell upon Matthias and he was numbered with the eleven")).toEqual([])
        expect(calls("they called Joseph and Matthias")).toEqual([])
        expect(calls("a man named Matthias was chosen")).toEqual([])
    })
    it("takes a sound-alike only before a plain command", () => {
        expect(calls("messias next verse")).toEqual(["next verse"])
        expect(calls("we have found the messias which is being interpreted the Christ")).toEqual([])
    })
    it("hears the name run together with hey, and never takes Matthew for it", () => {
        expect(calls("HeMatthias put up Ps twenty three")).toEqual(["put up Ps twenty three"])
        expect(calls("turn to Matthew chapter five verse three")).toEqual([])
    })
})

describe("parseRequest", () => {
    const type = (words: string) => parseRequest(words).type
    it("steps through scripture", () => {
        expect(parseRequest("next verse")).toEqual({ type: "navigate", command: { type: "verse-step", delta: 1 } })
        expect(parseRequest("Next.")).toEqual({ type: "navigate", command: { type: "verse-step", delta: 1 } })
        expect(parseRequest("go to verse five")).toEqual({ type: "navigate", command: { type: "goto-verse", verse: 5 } })
        expect(parseRequest("next chapter please")).toMatchObject({ type: "navigate" })
    })
    it("clears, restores, locks and switches the screen", () => {
        expect(parseRequest("clear the screen")).toEqual({ type: "clear", all: false })
        expect(parseRequest("hear the screen")).toEqual({ type: "clear", all: false })
        expect(parseRequest("take it down")).toEqual({ type: "clear", all: false })
        expect(parseRequest("clear everything")).toEqual({ type: "clear", all: true })
        expect(parseRequest("bring it back")).toEqual({ type: "restore" })
        expect(parseRequest("lock the screen")).toEqual({ type: "lock", on: true })
        expect(parseRequest("turn the screen on")).toEqual({ type: "screen", on: true })
    })
    it("takes over and stands down", () => {
        expect(parseRequest("take over")).toEqual({ type: "agent", on: true })
        expect(parseRequest("stand down")).toEqual({ type: "agent", on: false })
    })
    it("changes the version", () => {
        expect(parseRequest("use the NLT")).toEqual({ type: "version", name: "nlt" })
        expect(parseRequest("read that in the message")).toEqual({ type: "version", name: "message" })
        expect(type("in the beginning verse 1")).not.toBe("version")
    })
    it("tells a search from a passage from a song", () => {
        expect(parseRequest("find the verse about being anxious")).toEqual({ type: "search", query: "being anxious", topic: true })
        expect(parseRequest("show me the scripture that says love is patient")).toEqual({ type: "search", query: "love is patient" })
        expect(parseRequest("what does the Bible say about forgiveness?")).toEqual({ type: "search", query: "forgiveness", topic: true })
        expect(parseRequest("put up Psalm twenty three")).toEqual({ type: "show", what: "psalm twenty three" })
        expect(parseRequest("sing Amazing Grace")).toEqual({ type: "song", name: "amazing grace" })
        expect(type("was a faithful brother")).toBe("unknown")
    })
    it("understands the commands as the model writes them for a Nigerian voice", () => {
        const next = { type: "navigate", command: { type: "verse-step", delta: 1 } }
        for (const words of ["Next Vas", "Nextvas", "next versus", "Next V", "e next vas", "next us"]) expect(parseRequest(words)).toEqual(next)
        expect(parseRequest("Cladescreen")).toEqual({ type: "clear", all: false })
        expect(parseRequest("Cletherscreen")).toEqual({ type: "clear", all: false })
        expect(parseRequest("Sim Rock of Ages")).toEqual({ type: "song", name: "rock of ages" })
        expect(parseRequest("was a faithful witness of the resurrection").type).toBe("unknown")
        expect(parseRequest("Takova")).toEqual({ type: "agent", on: true })
        for (const words of ["put up Ps twenty three", "puts up Ps twenty three", "put up some twenty three", "Put Ups twenty three".replace("Ups", "up sum")]) expect(parseRequest(words)).toEqual({ type: "show", what: "psalm twenty three" })
        expect(parseRequest("showed John three sixteen")).toEqual({ type: "show", what: "john three sixteen" })
        expect(parseRequest("turned to fast Corinthians thirteen four")).toEqual({ type: "show", what: "first corinthians thirteen four" })
        expect(parseRequest("find diverse about being anxious")).toEqual({ type: "search", query: "being anxious", topic: true })
        for (const words of ["Cla the screen", "Claire the Screen", "clea the screen"]) expect(parseRequest(words)).toEqual({ type: "clear", all: false })
        expect(parseRequest("Sin Amazing Grace")).toEqual({ type: "song", name: "amazing grace" })
    })
    it("moves through what a search found", () => expect(parseRequest("another one")).toEqual({ type: "result", direction: "next" }))
})

describe("matchTitle", () => {
    const list = ["Amazing Grace", "Amazing Grace (My Chains Are Gone)", "How Great Thou Art", "Great Are You Lord", "What a Beautiful Name"].map((name) => ({ name }))
    it("finds the song that was meant", () => {
        expect(matchTitle("amazing grace", list)?.name).toBe("Amazing Grace")
        expect(matchTitle("beautiful name", list)?.name).toBe("What a Beautiful Name")
        expect(matchTitle("how great thou art", list)?.name).toBe("How Great Thou Art")
    })
    it("does not guess", () => {
        expect(matchTitle("great", list)).toBeNull()
        expect(matchTitle("oceans", list)).toBeNull()
    })
})
