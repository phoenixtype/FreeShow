// dates as this computer's clock reads them, never from toISOString (that is another time zone)

const two = (n: number) => String(n).padStart(2, "0")

/** "2026-11-29" */
export const localDay = (at: Date) => `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`

export const startOfDay = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
