import { describe, expect, it } from "vitest"
import { bibleAction } from "./bibleAccess"

const free = { code: "KJV", licensed: false }
const licensed = { code: "NIV", licensed: true }

describe("what a Bible in the download list offers", () => {
    it("downloads a free or approved version", () => {
        expect(bibleAction(free, { signedIn: false, plan: "free" })).toBe("download")
        expect(bibleAction(licensed, { signedIn: true, plan: "church", request: "granted" })).toBe("download")
    })
    it("offers the way to get a licensed one, never plain words", () => {
        expect(bibleAction(licensed, { signedIn: false, plan: "free" })).toBe("sign_in")
        expect(bibleAction(licensed, { signedIn: true, plan: "free" })).toBe("see_plans")
        expect(bibleAction(licensed, { signedIn: true, plan: "church" })).toBe("ask")
        expect(bibleAction(licensed, { signedIn: true, plan: "church", request: "pending" })).toBe("waiting")
    })
})
