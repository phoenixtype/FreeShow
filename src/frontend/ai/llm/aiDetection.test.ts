import { describe, expect, it } from "vitest"
import { usesAiDetection } from "./aiDetection"

describe("AI detection", () => {
    it("is off on a new install and with a provider chosen", () => {
        expect(usesAiDetection({})).toBe(false)
        expect(usesAiDetection(undefined)).toBe(false)
        expect(usesAiDetection({ enabled: true, llm: { provider: "scriptural" } })).toBe(false)
    })
    it("is on only when switched on, or in agent mode", () => {
        expect(usesAiDetection({ llm: { provider: "scriptural", detect: true } })).toBe(true)
        expect(usesAiDetection({ matthias: { agentMode: true } })).toBe(true)
    })
})
