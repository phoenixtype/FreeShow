import { describe, expect, it } from "vitest"
import { classifyListenError, downloadPercent, isSilent, listenNotice, NO_AUDIO_MS, RECOVERY_DELAYS, SILENCE_NOTICE_MS, shouldRetryListening, streamLost } from "./listenStatus"

describe("what went wrong with listening", () => {
    it("tells a missing speech model from a blocked microphone and anything else", () => {
        expect(classifyListenError("The local model is missing")).toBe("model")
        expect(classifyListenError("The local model is outdated")).toBe("model")
        expect(classifyListenError("Nemotron could not be initialized")).toBe("model")
        expect(classifyListenError("No microphone access")).toBe("permission")
        expect(classifyListenError("NotAllowedError: Permission denied")).toBe("permission")
        expect(classifyListenError("Nemotron transcription process exited unexpectedly (code 1)")).toBe("other")
        expect(classifyListenError(undefined)).toBe("other")
    })

    it("gives each problem one message and one action", () => {
        expect(listenNotice("model")).toEqual({ message: "The speech model is not on this computer yet.", action: "Get the speech model" })
        expect(listenNotice("permission")).toEqual({ message: "This app is not allowed to use the microphone.", action: "Allow the microphone" })
        expect(listenNotice("disconnected")).toEqual({ message: "Microphone disconnected.", action: "Try again" })
        expect(listenNotice("other")).toEqual({ message: "Listening stopped.", action: "Try again" })
    })
})

describe("recovering a lost microphone", () => {
    it("retries at 2, 5 and 15 seconds", () => {
        expect(RECOVERY_DELAYS).toEqual([2000, 5000, 15000])
    })

    it("counts a stream as lost when audio stops arriving for 3 seconds", () => {
        const now = 100_000
        expect(streamLost(now, now - (NO_AUDIO_MS - 1))).toBe(false)
        expect(streamLost(now, now - NO_AUDIO_MS)).toBe(true)
        expect(streamLost(now, 0)).toBe(false) // nothing has arrived yet: still starting
    })

    it("notices 20 seconds with no sound", () => {
        const now = 100_000
        expect(isSilent(now, now - (SILENCE_NOTICE_MS - 1))).toBe(false)
        expect(isSilent(now, now - SILENCE_NOTICE_MS)).toBe(true)
    })
})

describe("speech model download", () => {
    it("shows whole percent, and nothing until the size is known", () => {
        expect(downloadPercent({ progress: 341_100_000, total: 682_200_000 })).toBe(50)
        expect(downloadPercent({ progress: 700, total: 600 })).toBe(100)
        expect(downloadPercent({ progress: 0, total: 0 })).toBeNull()
        expect(downloadPercent(undefined)).toBeNull()
    })
})

describe("trying again after a crash", () => {
    it("retries whenever listening was on and the operator did not stop it", () => {
        expect(shouldRetryListening({ state: "error", asked: true, problem: "other" })).toBe(true)
        expect(shouldRetryListening({ state: "error", asked: true, problem: "disconnected" })).toBe(true)
    })

    it("does not retry after the operator stopped it, or when listening is fine", () => {
        expect(shouldRetryListening({ state: "error", asked: false, problem: "other" })).toBe(false)
        expect(shouldRetryListening({ state: "listening", asked: true, problem: "" })).toBe(false)
        expect(shouldRetryListening({ state: "inactive", asked: true, problem: "" })).toBe(false)
    })

    it("does not loop on a problem a retry cannot fix", () => {
        expect(shouldRetryListening({ state: "error", asked: true, problem: "model" })).toBe(false)
        expect(shouldRetryListening({ state: "error", asked: true, problem: "permission" })).toBe(false)
    })
})
