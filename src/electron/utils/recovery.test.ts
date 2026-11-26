import { describe, expect, it } from "vitest"
import { shouldReload } from "./recovery"

describe("shouldReload", () => {
    const now = 10_000_000

    it("loads a crashed or out-of-memory page again", () => {
        expect(shouldReload("crashed", [], now)).toBe(true)
        expect(shouldReload("oom", [], now)).toBe(true)
        expect(shouldReload("killed", [], now)).toBe(true)
    })
    it("leaves a page that was closed on purpose", () => {
        expect(shouldReload("clean-exit", [], now)).toBe(false)
    })
    it("stops after three in five minutes, and tries again later", () => {
        expect(shouldReload("crashed", [now - 1000, now - 2000, now - 3000], now)).toBe(false)
        expect(shouldReload("crashed", [now - 301_000, now - 302_000, now - 303_000], now)).toBe(true)
    })
})
