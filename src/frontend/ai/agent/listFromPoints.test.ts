import { describe, expect, it } from "vitest"
import { listFromPoints, MAX_POINTS, MAX_POINT_CHARS } from "./listFromPoints"

describe("listFromPoints", () => {
    it("makes bullet lines from clean points", () => {
        expect(listFromPoints("  Three keys ", ["1. Pray", "- Read", "Pray", "* Obey"])).toEqual({ title: "Three keys", text: "• Pray\n• Read\n• Obey", count: 3 })
    })
    it("caps points and their length", () => {
        const list = listFromPoints(
            "T",
            Array.from({ length: 20 }, (_, i) => `point ${i} ${"x".repeat(200)}`)
        ) as any
        expect(list.count).toBe(MAX_POINTS)
        expect(list.text.split("\n")[0].length).toBeLessThanOrEqual(MAX_POINT_CHARS + 2)
    })
    it("refuses a list without a title or with fewer than two points", () => {
        expect(listFromPoints("", ["a", "b"])).toHaveProperty("error")
        expect(listFromPoints("T", ["only"])).toHaveProperty("error")
        expect(listFromPoints("T", "not a list")).toHaveProperty("error")
    })
    it("drops control characters", () => {
        expect((listFromPoints("T\u0000x", ["a\nb", "c"]) as any).text).toBe("• a b\n• c")
    })
})
