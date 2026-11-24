import { describe, expect, it } from "vitest"
import { findCalls, matchTitle, parseRequest } from "./silas"

const calls = (words: string) => findCalls(words).map((c) => c.request)

describe("findCalls", () => {
    it("hears the name and what follows", () => {
        expect(calls("And that is why we trust him. Silas, show John three sixteen.")).toEqual(["show John three sixteen."])
        expect(calls("hey silus next verse")).toEqual(["next verse"])
        expect(calls("Let us stand Sillas clear the screen Silas next verse")).toEqual(["clear the screen", "next verse"])
        expect(calls("okay Silas")).toEqual([""])
    })
    it("does not answer when Silas is only spoken about", () => {
        expect(calls("but at midnight Paul and Silas prayed and sang praises")).toEqual([])
        expect(calls("he chose Silas and departed")).toEqual([])
        expect(calls("the man named Silas was a prophet")).toEqual([])
    })
    it("takes a sound-alike only before a plain command", () => {
        expect(calls("silence next verse")).toEqual(["next verse"])
        expect(calls("there was silence in heaven for half an hour")).toEqual([])
        expect(calls("silence fell on the whole crowd and they listened")).toEqual([])
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
