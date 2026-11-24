import { describe, expect, it, vi } from "vitest"

vi.mock("../voice/matthiasAgent", () => ({ Matthias: { hear: () => false } }))
vi.mock("../../stores", () => ({ ai: { subscribe: () => () => {} }, sttTranscript: { subscribe: () => () => {} } }))
vi.mock("../../utils/common", () => ({ newToast: () => {} }))
vi.mock("../manager/AiManager", () => ({ AiManager: {} }))

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
