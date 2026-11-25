import { describe, expect, it, vi } from "vitest"

vi.mock("../voice/matthiasAgent", () => ({ Matthias: { hear: () => false } }))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { ai: writable({ enabled: true }), sttTranscript: writable({ finalized: "", unprocessed: "" }), transcriptLog: writable([]) }
})
vi.mock("../../utils/common", () => ({ newToast: () => {} }))
vi.mock("../manager/AiManager", () => ({ AiManager: { processSTTChunk: vi.fn() } }))

import { get } from "svelte/store"
import { sttTranscript, transcriptLog } from "../../stores"
import { Transcript } from "./transcript"

const start = (last: string[], curr: string[]) => {
    ;(Transcript as any).lastSentWords = last
    return (Transcript as any).calculateStartIndex(curr)
}

describe("Transcript window", () => {
    it("counts only new words once the 120-word window slides", () => {
        const words = Array.from({ length: 125 }, (_, i) => `w${i}`)
        const last = words.slice(0, 120)
        const curr = words.slice(5, 125)
        expect(curr.length - start(last, curr)).toBe(5)
    })

    it("still counts a growing transcript", () => {
        expect(start(["a", "b", "c"], ["a", "b", "c", "d"])).toBe(3)
    })
})

describe("transcription log", () => {
    it("keeps what was heard in lines, and clears with a way back", () => {
        vi.useFakeTimers()
        Transcript.push({ text: "in the beginning" })
        Transcript.push({ text: "was the Word" })
        Transcript.push({ text: "half a", interim: true })
        vi.advanceTimersByTime(10_000)
        Transcript.push({ text: "and the Word was with God" })
        expect(get(transcriptLog).map((l) => l.text)).toEqual(["in the beginning was the Word", "and the Word was with God"])
        const undo = Transcript.clear()
        expect(get(transcriptLog)).toEqual([])
        expect(get(sttTranscript)).toEqual({ finalized: "", unprocessed: "" })
        Transcript.push({ text: "new words" })
        undo()
        expect(get(transcriptLog)).toHaveLength(3)
    })
})
