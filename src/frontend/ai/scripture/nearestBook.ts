// A book name the speech model misspelled, mostly for an accent it knows less well:
// "Josea chapter 3 verse 5", "Maccah chapter 3". Only read where the words around it are
// plainly a reference (a chapter named, or "3 verse 5"), and only when one book is clearly
// the nearest.

const SAID_AS: Record<string, string> = { route: "ruth", root: "ruth", joe: "joel", juna: "jonah", junah: "jonah", pita: "peter", petah: "peter", sama: "samuel", samma: "samuel", sammer: "samuel", samu: "samuel", hagia: "haggai", estaptre: "esther", esta: "esther", mak: "mark", max: "mark", luk: "luke", look: "luke", jud: "jude", axe: "acts", ax: "acts", akts: "acts", tito: "titus", taitus: "titus", nehom: "nahum", neham: "nahum", timmethi: "timothy", timoth: "timothy" }
const NUMBERED = new Set(["samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "john"])
const NOT_NAMES = new Set(["the", "same", "this", "that", "next", "last", "first", "second", "third", "whole", "read", "in", "to", "from", "of", "and", "at", "our", "your", "my", "book", "is", "a", "another", "previous", "one", "his", "with", "verse", "chapter", "bible", "bibles", "open", "turn", "philip", "new", "old", "then", "now", "also", "see", "go", "says", "on"])

// how a name sounds, roughly, whoever says it
const sound = (word: string) =>
    word
        .toLowerCase()
        .replace(/ph/g, "f")
        .replace(/th/g, "t")
        .replace(/ch|ck|c|q/g, "k")
        .replace(/[yj](?=[aeiou])/g, "h")
        .replace(/z/g, "s")
        .replace(/h\b/g, "")
        .replace(/(.)\1+/g, "$1")

export function distance(a: string, b: string): number {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        const next = [i]
        for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        row = next
    }
    return row[b.length]
}

export function nearestBook(word: string, names: string[]): string | null {
    const said = word.toLowerCase()
    if (NOT_NAMES.has(said)) return null
    const plain = [...new Set(names.map((name) => name.toLowerCase().replace(/^[1-3] /, "")))]
    if (plain.includes(said)) return said
    if (SAID_AS[said] && plain.includes(SAID_AS[said])) return SAID_AS[said]
    if (said.length < 4) return null

    const scored = plain
        .filter((name) => !name.includes(" "))
        .map((name) => ({ name, score: distance(sound(said), sound(name)) + distance(said, name) / 10 }))
        .sort((a, b) => a.score - b.score)
    const [best, second] = scored
    if (!best || best.score > Math.max(1, Math.floor(said.length / 3)) + 0.5) return null
    return second && second.score - best.score < 0.2 ? null : best.name
}

/** text: numbers already as digits */
export function correctBookNames(text: string, names: string[], chapterWords: string, verseWords: string): string {
    const reference = new RegExp(`(?<![\\p{L}\\d])(?:([1-3]|first|second|third) )?(\\p{L}+)[,]? (?=(?:${chapterWords}) \\d|\\d+,? (?:${verseWords}) \\d)`, "giu")
    const fused = text
        .replace(/\bfes(?:t|s)?[ -]?timoth\w*/giu, "first timothy")
        // "Shohabukuk chapter 2": the word before run into the name
        .replace(new RegExp(`\\b(?:sho|show|read|to)(\\p{L}{5,}) (?=(?:${chapterWords}) \\d)`, "giu"), (all, rest: string) => {
            const book = nearestBook(rest, names)
            return book ? `${book} ` : all
        })
    return fused.replace(reference, (all, number: string | undefined, word: string) => {
        const book = nearestBook(word, names)
        if (!book || book === word.toLowerCase()) return all
        // "2 Pita" is Peter; a number before a book that has none was part of the sentence
        if (number && !NUMBERED.has(book)) return all
        return `${number ? `${number} ` : ""}${book} `
    })
}
