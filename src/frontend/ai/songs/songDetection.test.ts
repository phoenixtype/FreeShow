import { describe, expect, it } from "vitest"
import { bestSlide, SongDetector, SongIndex, words } from "./songDetection"

// public-domain hymns
const AMAZING = "Amazing grace how sweet the sound that saved a wretch like me I once was lost but now am found was blind but now I see. 'Twas grace that taught my heart to fear and grace my fears relieved how precious did that grace appear the hour I first believed"
const WELL = "When peace like a river attendeth my way when sorrows like sea billows roll whatever my lot thou hast taught me to say it is well it is well with my soul. It is well with my soul it is well it is well with my soul"
const HOLY = "Holy holy holy Lord God Almighty early in the morning our song shall rise to thee holy holy holy merciful and mighty God in three persons blessed Trinity"
const ASSURANCE = "Blessed assurance Jesus is mine oh what a foretaste of glory divine heir of salvation purchase of God born of his spirit washed in his blood. This is my story this is my song praising my Saviour all the day long"

const index = new SongIndex([
    { id: "amazing", name: "Amazing Grace", text: AMAZING },
    { id: "well", name: "It Is Well", text: WELL },
    { id: "holy", name: "Holy, Holy, Holy", text: HOLY },
    { id: "assurance", name: "Blessed Assurance", text: ASSURANCE },
    { id: "short", name: "Too short", text: "hallelujah amen" },
    { id: "amazing-2", name: "Amazing Grace 2", text: AMAZING.replace("the hour I first believed", "") }
])

describe("words", () => {
    it("folds case, apostrophes and punctuation", () => {
        expect(words("'Twas grace, that taught—my HEART")).toEqual(["twas", "grace", "that", "taught", "my", "heart"])
    })
})

describe("SongDetector", () => {
    it("skips songs too short to tell apart", () => {
        expect(index.size).toBe(5)
    })

    it("recognises a song from a sung line", () => {
        const d = new SongDetector(index)
        const hit = d.push("amazing grace how sweet the sound that saved a wretch like me", 0)
        expect(hit?.id).toBe("amazing")
        expect(hit!.confidence).toBeGreaterThan(75) // a second copy in the library is no rival
    })

    it("moves to the next song at once", () => {
        const d = new SongDetector(index)
        d.push("amazing grace how sweet the sound that saved a wretch like me i once was lost but now am found", 0)
        expect(d.push("this is my story this is my song praising my saviour all the day long", 2000)?.id).toBe("assurance")
    })

    it("says nothing new once the singing stops", () => {
        const d = new SongDetector(index)
        expect(d.push("amazing grace how sweet the sound that saved a wretch like me", 0)?.id).toBe("amazing")
        expect(d.push("good morning church please be seated", 3000)).toBeNull()
    })

    it("stays quiet on speech", () => {
        const d = new SongDetector(index)
        expect(d.push("good morning church please turn with me to the book of romans", 0)).toBeNull()
    })

    it("needs more than a few shared words", () => {
        const d = new SongDetector(index)
        expect(d.push("it is well", 0)).toBeNull()
    })

    it("builds up across chunks and does not count the overlap twice", () => {
        const d = new SongDetector(index)
        const first = d.push("when peace like a river", 0)
        const again = d.push("when peace like a river", 1000)
        expect(again?.confidence ?? 0).toBeLessThanOrEqual(first?.confidence ?? 0)
        const more = d.push("when peace like a river attendeth my way when sorrows like sea billows roll", 2000)
        expect(more?.id).toBe("well")
        expect(more!.confidence).toBeGreaterThan(first?.confidence ?? 0)
    })

    it("tolerates a rough transcript", () => {
        const d = new SongDetector(index)
        const hit = d.push("this is my story this is my song praising my savior all the day long", 0)
        expect(hit?.id).toBe("assurance")
    })

    it("forgets a song once it stops", () => {
        const d = new SongDetector(index)
        expect(d.push("holy holy holy lord god almighty early in the morning", 0)?.id).toBe("holy")
        expect(d.push("let us pray", 120_000)).toBeNull()
    })
})

describe("a song that keeps being sung (B14)", () => {
    const FIRST = "when peace like a river attendeth my way when sorrows like sea billows roll"
    const SECOND = "whatever my lot thou hast taught me to say it is well with my soul"

    it("is only sustained once it has been heard twice, eight seconds apart", () => {
        const d = new SongDetector(index)
        expect(d.push(FIRST, 0)?.sustained).toBe(false)
        expect(d.push(SECOND, 4000)?.sustained).toBe(false)
        expect(d.push("it is well it is well with my soul", 9000)?.sustained).toBe(true)
    })

    it("starts over after a long break", () => {
        const d = new SongDetector(index)
        d.push(FIRST, 0)
        expect(d.push(SECOND, 40_000)?.sustained).toBe(false)
    })
})

describe("bestSlide", () => {
    const slides = ["Amazing grace how sweet the sound that saved a wretch like me", "I once was lost but now am found was blind but now I see", "Twas grace that taught my heart to fear"]

    it("finds the slide being sung", () => {
        expect(bestSlide(slides, "i once was lost but now am found")).toBe(1)
    })

    it("moves on to the next chorus rather than back to the first", () => {
        const song = ["Chorus it is well with my soul", "Verse when peace like a river", "Chorus it is well with my soul"]
        expect(bestSlide(song, "it is well with my soul", 1)).toBe(2)
        expect(bestSlide(song, "it is well with my soul", 0)).toBe(0)
    })

    it("goes with the words heard last", () => {
        expect(bestSlide(slides, "how sweet the sound that saved i once was lost but now am")).toBe(1)
    })

    it("returns null when nothing matches", () => {
        expect(bestSlide(slides, "let us pray")).toBeNull()
    })
})
