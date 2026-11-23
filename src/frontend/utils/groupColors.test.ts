import { describe, expect, it } from "vitest"
import { recolorDefaultGroups } from "./groupColors"

describe("slide group colours", () => {
    it("moves old purple defaults to the new palette and keeps a church's own colour", () => {
        const out = recolorDefaultGroups({ verse: { color: "#5825F5" }, chorus: { color: "#ff0000" }, custom: { color: "#5825f5" } })
        expect(out.verse.color).toBe("#3b82f6")
        expect(out.chorus.color).toBe("#ff0000")
        expect(out.custom.color).toBe("#5825f5")
    })
})
