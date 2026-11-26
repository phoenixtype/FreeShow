import { describe, expect, it } from "vitest"
import { findCalls, matchTitle, namesWhatToShow, parseRequest, parseRequests } from "./matthias"

const calls = (words: string) => findCalls(words).map((c) => c.request)

describe("findCalls", () => {
    it("hears the name and what follows", () => {
        expect(calls("And that is why we trust him. Matthias, show John three sixteen.")).toEqual(["show John three sixteen."])
        expect(calls("hey Matias next verse")).toEqual(["next verse"])
        expect(calls("Let us stand. Mathias clear the screen. Matthias next verse")).toEqual(["clear the screen.", "next verse"])
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

describe("the name in a sermon", () => {
    // without "hey", the name has to start the utterance and the request has to be all of it
    const sermon = [
        "They prayed. Matthias. Next verse",
        "They prayed, Matthias, next verse",
        "and the lot fell upon Matthias next verse",
        "Peter stood up and Matthias next verse",
        "So Matthias clear the screen",
        "Then they cast lots, and Matthias was chosen."
    ]
    it.each(sermon)("does nothing for: %s", (words) => expect(calls(words)).toEqual([]))
    it("still answers a plain call that starts a sentence, or any call with hey", () => {
        expect(calls("Amen. Matthias, next verse.")).toEqual(["next verse."])
        expect(calls("Matthias next verse")).toEqual(["next verse"])
        expect(calls("so then hey Matthias next verse")).toEqual(["next verse"])
        expect(calls("They prayed. Hey Matthias. Next verse")).toEqual(["Next verse"])
    })
    it("ends the request at the end of its sentence", () => {
        expect(calls("Matthias, clear the screen. And then Peter said")).toEqual(["clear the screen."])
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

describe("parseRequests", () => {
    const types = (words: string) => parseRequests(words).map((r) => r.type)
    it("takes apart what was asked in one breath", () => {
        expect(types("put up Psalm 23 then clear the screen")).toEqual(["show", "clear"])
        expect(types("next verse and then lock the screen")).toEqual(["navigate", "lock"])
        expect(types("show John 3:16 and read it in the NLT")).toEqual(["show", "version"])
        expect(types("sing Amazing Grace, and go to the chorus")).toEqual(["song", "section"])
    })
    it("leaves an and that belongs to the words", () => {
        expect(types("sing Trust and Obey")).toEqual(["song"])
        expect(types("show first and second Samuel")).toEqual(["show"])
        expect(types("find the verse about love and take it down")).toEqual(["search"])
        expect(types("show the passage where he rose and then went away")).toHaveLength(1)
    })
})

describe("more that can be asked", () => {
    it("is polite or not", () => {
        for (const words of ["please can you show John 3 16", "I want you to show John 3 16 please", "could you kindly show John 3 16 for us", "go ahead and show John 3 16 now"]) expect(parseRequest(words)).toEqual({ type: "show", what: "john 3 16" })
        expect(parseRequest("can we have the next verse please").type).not.toBe("show")
    })
    it("parts of a song, slides and steps", () => {
        expect(parseRequest("take us back to the chorus")).toEqual({ type: "section", name: "chorus" })
        expect(parseRequest("the bridge again")).toEqual({ type: "section", name: "bridge" })
        expect(parseRequest("pre-chorus")).toEqual({ type: "section", name: "prechorus" })
        expect(parseRequest("go to slide five")).toEqual({ type: "goto-slide", slide: 5 })
        expect(parseRequest("last slide")).toEqual({ type: "goto-slide", slide: "last" })
        expect(parseRequest("go back two verses")).toEqual({ type: "slide", direction: "previous", count: 2 })
        expect(parseRequest("next three slides")).toEqual({ type: "slide", direction: "next", count: 3 })
    })
    it("the plan, the timer and the app", () => {
        expect(parseRequest("start the service")).toEqual({ type: "plan", step: "start" })
        expect(parseRequest("next item in the plan")).toEqual({ type: "plan", step: "next" })
        expect(parseRequest("open the plan Sunday morning")).toEqual({ type: "open-plan", name: "sunday morning" })
        expect(parseRequest("add Amazing Grace to the plan")).toEqual({ type: "add-to-plan", what: "amazing grace" })
        expect(parseRequest("put John 3 16 in the plan").type).toBe("add-to-plan")
        expect(parseRequest("start the timer")).toEqual({ type: "timer", command: "start" })
        expect(parseRequest("open settings")).toEqual({ type: "page", page: "settings" })
        expect(parseRequest("what's on the screen?")).toEqual({ type: "tell", about: "screen" })
        expect(parseRequest("what's next")).toEqual({ type: "tell", about: "next" })
    })
    it("goes back over what was shown", () => {
        expect(parseRequest("show that again")).toEqual({ type: "again" })
        expect(parseRequest("go back to the last scripture")).toEqual({ type: "before", kind: "scripture" })
        expect(parseRequest("clear the background")).toEqual({ type: "clear-layer", layer: "background" })
    })
    it("tells what is to be shown from what is only spoken of", () => {
        expect(namesWhatToShow("John three sixteen")).toBe(true)
        expect(namesWhatToShow("put John 3 16 in the plan")).toBe(false)
        expect(namesWhatToShow("who wrote John 3 16")).toBe(false)
        expect(namesWhatToShow("make a plan with John 3 16")).toBe(false)
    })
})

describe("drawing", () => {
    it("understands plain shapes, however they are asked for", () => {
        expect(parseRequest("Draw a cross")).toEqual({ type: "draw", shape: "cross" })
        expect(parseRequest("daw the picture of a cross on the paint board")).toEqual({ type: "draw", shape: "cross" })
        expect(parseRequest("daw a cross on the paint board")).toEqual({ type: "draw", shape: "cross" })
        expect(parseRequest("please draw a square")).toEqual({ type: "draw", shape: "box" })
        expect(parseRequest("draw me an arrow on the screen")).toEqual({ type: "draw", shape: "arrow" })
    })
    it("tidies and clears the drawing, and leaves described drawings to the model", () => {
        expect(parseRequest("clean up the drawing")).toEqual({ type: "drawing", command: "clean" })
        expect(parseRequest("tidy the drawing")).toEqual({ type: "drawing", command: "clean" })
        expect(parseRequest("clear the drawing")).toEqual({ type: "drawing", command: "clear" })
        expect(parseRequest("clear the paint board")).toEqual({ type: "drawing", command: "clear" })
        expect(parseRequest("Draw what the preacher is describing")).toMatchObject({ type: "unknown" })
    })
    it("does it in order with other requests", () => {
        expect(parseRequests("clear the screen then draw a cross").map((r) => r.type)).toEqual(["clear", "draw"])
    })
})
