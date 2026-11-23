// Plain date arithmetic for the calendar, in local time. No app imports, so it can be tested alone.

export const MILLISECONDS_IN_A_DAY = 86400000

export const copyDate = (date: Date, add = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + add)
export const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// month: 0 to 11; day 0 of the next month is the last day of this one
export const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

export function getWeekNumber(d: Date) {
    d = copyDate(d)
    d.setDate(getNearestThursday())

    const firstDayInYear = new Date(d.getFullYear(), 0, 1)
    // rounded: a daylight-saving change makes a local day 23 or 25 hours long
    const daysPassedCurrentYear = Math.round((d.getTime() - firstDayInYear.getTime()) / MILLISECONDS_IN_A_DAY) + 1
    const weekNumber = Math.ceil(daysPassedCurrentYear / 7)

    return weekNumber

    // ISO 8601 states that week 1 is the week with the first Thursday of that year
    function getNearestThursday() {
        const todaysWeekday = d.getDay() || 7 // change Sunday to 7
        const nearestThursday = d.getDate() + 4 - todaysWeekday
        return nearestThursday
    }
}
