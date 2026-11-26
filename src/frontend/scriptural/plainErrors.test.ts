import { describe, expect, it } from "vitest"
import { plainRestError, plainSignInError } from "./plainErrors"

describe("server refusals in plain words", () => {
    it("keeps the sentences our own database writes", () => {
        expect(plainRestError(400, { code: "P0001", message: "Your plan is full." })).toBe("Your plan is full.")
        expect(plainRestError(403, { code: "42501", message: "Not a member of this church" })).toBe("Not a member of this church")
    })
    it("never shows table names or policies", () => {
        const raw = ['duplicate key value violates unique constraint "songs_pkey"', 'new row violates row-level security policy for table "songs"', "permission denied for table churches"]
        expect(plainRestError(409, { code: "23505", message: raw[0] })).toBe("That did not work. Try again.")
        expect(plainRestError(403, { code: "42501", message: raw[1] })).toMatch(/role/)
        expect(plainRestError(403, { code: "42501", message: raw[2] })).toMatch(/role/)
        expect(plainRestError(502, null)).toMatch(/not answering/)
    })
    it("says what to do when a sign-in code is refused", () => {
        expect(plainSignInError(403)).toMatch(/new code/)
        expect(plainSignInError(429)).toMatch(/Wait a minute/)
    })
})
