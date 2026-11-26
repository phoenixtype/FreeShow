import { describe, expect, it } from "vitest"
import { NemotronDriver } from "./models/nemotronWorker"
import { canRestartAfterCrash, findRepeatedTail, isMusicAnnotation, segmentConfidence } from "./sttHelper"

describe("restarting a crashed speech engine", () => {
    const now = 1_000_000

    it("allows three restarts in five minutes and no more", () => {
        expect(canRestartAfterCrash([], now)).toBe(true)
        expect(canRestartAfterCrash([now - 1000, now - 2000], now)).toBe(true)
        expect(canRestartAfterCrash([now - 1000, now - 2000, now - 3000], now)).toBe(false)
    })

    it("forgets crashes older than five minutes", () => {
        expect(canRestartAfterCrash([now - 301_000, now - 302_000, now - 303_000], now)).toBe(true)
    })
})

const times = (phrase: string, count: number) => Array.from({ length: count }, () => phrase).join(" ")
const loops = (text: string) => findRepeatedTail(text) >= 0

describe("repeated tail", () => {
    it("catches a phrase cycling", () => {
        expect(loops(`he spoke to them and ${times("and he saith the LORD", 6)}`)).toBe(true)
        expect(loops(times("Saith the LORD,", 5))).toBe(true)
    })

    it("marks where the cycle starts so the first occurrence is kept", () => {
        const text = `he said ${times("the king of", 6)}`
        expect(text.slice(0, findRepeatedTail(text)).trim()).toBe("he said the king of")
    })

    it("leaves rhetorical repetition alone", () => {
        expect(loops("change your atmosphere atmosphere atmosphere")).toBe(false)
        expect(loops("holy holy holy is the Lord God almighty")).toBe(false)
        expect(loops(times("praise the Lord", 3))).toBe(false)
    })

    it("ignores a repeat the speaker has moved on from", () => {
        expect(loops(`${times("amen", 10)} and now let us turn to the scripture together`)).toBe(false)
    })
})

describe("segment confidence", () => {
    // tokens carry their own separators, so " A" "ft" "er" " " "e" "ar" "ly" joins to " After early"
    const tokens = [" A", "ft", "er", " ", "e", "ar", "ly"]
    const probs = [0.9, 0.9, 0.9, 1, 0.5, 0.5, 0.5].map(Math.log)

    it("averages the tokens behind the committed words", () => {
        expect(segmentConfidence(tokens, probs, "After early", 0, 5)).toBe(90)
        expect(segmentConfidence(tokens, probs, "After early", 6, 11)).toBe(50)
    })

    it("reports nothing when the tokens do not line up with the text", () => {
        expect(segmentConfidence(tokens, probs, "something else", 0, 5)).toBeUndefined()
        expect(segmentConfidence([], [], "After", 0, 5)).toBeUndefined()
    })
})

describe("music annotation", () => {
    it("recognises the labels the engines emit", () => {
        expect(isMusicAnnotation("[MUSIC PLAYING]")).toBe(true)
        expect(isMusicAnnotation("(upbeat music)")).toBe(true)
        expect(isMusicAnnotation("♪ la la la ♪")).toBe(true)
    })

    it("recognises the opening half of a label split across segments", () => {
        expect(isMusicAnnotation("[MUSIC")).toBe(true)
    })

    it("leaves speech alone", () => {
        expect(isMusicAnnotation("the music ministry will lead us now")).toBe(false)
        expect(isMusicAnnotation("the music ministry (led by Grace) will come now")).toBe(false)
        expect(isMusicAnnotation("[BLANK_AUDIO]")).toBe(false)
    })
})

describe("a computer that cannot keep up", () => {
    const heard = () => {
        const driver = new NemotronDriver({ language: "en", onSegment: () => {}, onError: () => {} })
        const taken: number[] = []
        driver.pushAudio = (buffer) => void taken.push(buffer[0])
        return { driver, taken }
    }

    it("lets late audio go until it has caught up", () => {
        const { driver, taken } = heard()
        const now = 100_000
        driver.pushLive(new Uint8Array([1]), now - 200, now)
        driver.pushLive(new Uint8Array([2]), now - 9000, now)
        // still behind: a few seconds late is not caught up yet
        driver.pushLive(new Uint8Array([3]), now - 3000, now)
        driver.pushLive(new Uint8Array([4]), now - 500, now)
        expect(taken).toEqual([1, 4])
    })
})
