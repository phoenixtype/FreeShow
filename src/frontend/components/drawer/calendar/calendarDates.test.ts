import { describe, expect, it } from "vitest"
import { getMonthName } from "../../helpers/time"
import { getDaysInMonth, getWeekNumber } from "./calendarDates"

describe("calendar dates", () => {
    it("names the month Date.getMonth() gives", () => {
        expect(getMonthName(new Date(2026, 10, 23).getMonth(), {}, false, "en")).toBe("November")
        expect(getMonthName(0, {}, false, "en")).toBe("January")
        expect(getMonthName(11, {}, false, "en")).toBe("December")
    })

    it("counts the days in each month", () => {
        expect(getDaysInMonth(2026, 10)).toBe(30) // November
        expect(getDaysInMonth(2026, 1)).toBe(28)
        expect(getDaysInMonth(2028, 1)).toBe(29)
        expect(getDaysInMonth(2026, 11)).toBe(31)
    })

    it("gives ISO week numbers, across daylight saving", () => {
        expect(getWeekNumber(new Date(2026, 10, 23))).toBe(48)
        expect(getWeekNumber(new Date(2026, 10, 1))).toBe(44) // a Sunday ends ISO week 44
        expect(getWeekNumber(new Date(2026, 6, 16))).toBe(29) // summer time
        expect(getWeekNumber(new Date(2027, 0, 1))).toBe(53) // 2026 has 53 weeks
        expect(getWeekNumber(new Date(2026, 0, 1))).toBe(1)
    })
})
