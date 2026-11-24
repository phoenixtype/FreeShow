import { expect, it, vi } from "vitest"
vi.mock("../../components/drawer/bible/scripture", () => ({ loadJsonBible: async () => null }))
vi.mock("../../stores", async () => ({ scriptures: (await import("svelte/store")).writable({}) }))
import { BibleCacheManager } from "./BibleCacheManager"
import { CANON } from "./canon"

it("has every book, chapter and verse", () => {
    expect(CANON).toHaveLength(66)
    expect(CANON.flatMap((b) => b.chapters)).toHaveLength(1189)
    expect(CANON.flatMap((b) => b.chapters.flatMap((c) => c.verses))).toHaveLength(31102)
})

it("follows spoken references with no Bible stored", async () => {
    const canon = await BibleCacheManager.getCanon()
    const heard = async (words: string, live = "") => (await canon.search(words, live))?.content
    expect(await heard("let us read john chapter three verse sixteen")).toBe("John 3:16")
    expect(await heard("turn to first corinthians thirteen four")).toBe("1 Corinthians 13:4")
    expect(await heard("and then verse seventeen", "John 3:16")).toBe("John 3:17")
    expect(await heard("john chapter three verse ninety nine")).toBeUndefined()
    expect(await heard("so you should be able to work when we go there")).toBeUndefined()
})

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"]
const spoken = (n: number) => (n < 20 ? SMALL[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${SMALL[n % 10]}` : ""}`)

it("follows every book, however the reference is said and wherever in the sentence", async () => {
    const canon = await BibleCacheManager.getCanon()
    const missed: string[] = []
    for (const book of CANON) {
        const chapter = Math.min(book.chapters.length, 3)
        const verse = Math.min(book.chapters[chapter - 1].verses.length, 12)
        const name = book.name.toLowerCase().replace(/^1 /, "first ").replace(/^2 /, "second ").replace(/^3 /, "third ")
        const ways = [
            `let us read ${name} chapter ${spoken(chapter)} verse ${spoken(verse)}`,
            `please open your bibles with me to ${name} ${spoken(chapter)} verse ${spoken(verse)} and it says`,
            `${book.name} ${chapter}:${verse}`,
            `it says in ${book.name} ${chapter}:${verse} that`,
            `turn to the book of ${book.name}, chapter ${chapter}, verse ${verse}.`
        ]
        for (const words of ways) {
            const got = (await canon.search(words, ""))?.content
            if (got !== `${book.name} ${chapter}:${verse}`) missed.push(`${words} -> ${got}`)
        }
    }
    expect(missed).toEqual([])
})
