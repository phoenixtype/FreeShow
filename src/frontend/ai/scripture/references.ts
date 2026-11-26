import type { BibleCacheData } from "./BibleCacheManager"
import { correctBookNames } from "./nearestBook"
import { CHAPTER_PATTERN, JOINER_PATTERN, normalizeBookName, OF_PATTERN, ORDINAL_PREFIX_PATTERN, PSALM_NORMALIZATION_MAP, PSALM_PATTERN, RANGE_PATTERN, THE_PATTERN, VERSE_PATTERN } from "./referenceDictionary"

// "1st John", "II Corinthians"
const NUMBERED_BOOKS = "samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john"
const SHORT_ORDINALS: Record<string, string> = { "1st": "1", "2nd": "2", "3rd": "3", i: "1", ii: "2", iii: "3" }
const SHORT_ORDINAL_REGEX = new RegExp(`(?<![\\p{L}\\p{N}])(1st|2nd|3rd|iii|ii|i)\\s+(?=(?:${NUMBERED_BOOKS})\\b)`, "giu")

// "First, John 3:16": a pause after the number means it was probably counting a point, not naming 1 John
const ORDINAL_ASIDE = new RegExp(`(?<![\\p{L}\\p{N}])(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|1st|2nd|3rd|one|two|three|[1-3])\\s*[,;:.!]\\s*(?=(?:${NUMBERED_BOOKS})\\b)`, "giu")
/** the words without such a number; null when there is none */
export function withoutOrdinalAside(text: string): string | null {
    const plain = text.replace(ORDINAL_ASIDE, "")
    return plain === text ? null : plain
}

export function normalizeReferences(text: string, cacheData: BibleCacheData): string {
    let normalized = text.replace(SHORT_ORDINAL_REGEX, (_, ordinal: string) => `${SHORT_ORDINALS[ordinal.toLowerCase()]} `)
    for (const [other, own] of Object.entries(cacheData.aliases || {})) normalized = normalized.replace(new RegExp(`\\b${other.replace(/ /g, "\\s+")}\\b`, "giu"), own)

    // 1. Remove punctuation that breaks numbered books and normalize ordinal book prefixes (e.g., "1, john 4" or "first, john" -> "1 john")
    normalized = normalized.replace(new RegExp(`\\b([1-3]|${ORDINAL_PREFIX_PATTERN})\\s*[,.\\-_]\\s*([\\p{L}]+)`, "giu"), "$1 $2")
    normalized = normalized.replace(new RegExp(`\\b(${ORDINAL_PREFIX_PATTERN})\\s+([\\p{L}]+)`, "giu"), (match) => normalizeBookName(match))

    // "Genesis, chapter 3, verse 12": the transcript's commas are not part of the reference
    normalized = normalized.replace(new RegExp(`\\s*[,;]\\s*(?=(?:${CHAPTER_PATTERN}|${VERSE_PATTERN})\\b)`, "giu"), " ")

    normalized = correctBookNames(normalized, cacheData.bookNames, CHAPTER_PATTERN, VERSE_PATTERN)

    // 6. Ordinal psalm phrasing: "the 23rd psalm" -> "Psalm 23". Before the plural step, while
    // one psalm still reads differently from "the 150 psalms"
    const ordinalPsalmRegex = new RegExp(`\\b(?:${THE_PATTERN})\\s+(\\d+)(?:st|nd|rd|th)?\\s+(${PSALM_PATTERN})\\b`, "giu")
    normalized = normalized.replace(ordinalPsalmRegex, "$2 $1")

    // 2. Normalize plural or localized book names (e.g., "Psalms" -> "Psalm")
    for (const [plural, singular] of Object.entries(PSALM_NORMALIZATION_MAP)) {
        // towards the name this Bible uses: some have "Psalm", some "Psalms"
        const own = cacheData.bookNames.map((name) => name.toLowerCase())
        const [from, to] = own.includes(plural) && !own.includes(singular.toLowerCase()) ? [singular, plural] : [plural, singular]
        normalized = normalized.replace(new RegExp(`\\b${from}\\b`, "giu"), to)
    }

    // "and chapter three verse sixteen": "and" is not a book, and the chapter must stay said
    const bookWords = cacheData.bookNames.flatMap((name) => [name.toLowerCase(), name.toLowerCase().split(" ").pop()!])
    const isBook = (name: string) => bookWords.includes(name.toLowerCase().replace(/\s+/g, " ")) || bookWords.includes(name.toLowerCase().replace(/^[1-3]\s*/, ""))

    // 3. Inverted structure: "verse 16 of John chapter 3" or "16th verse of John chapter 3" -> "John 3:16"
    const invertedRegex = new RegExp(`\\b(?:(?:${THE_PATTERN})\\s+)?(?:${VERSE_PATTERN})?\\s*(\\d+)\\s+(?:(?:${VERSE_PATTERN})\\s+)?(?:${OF_PATTERN})\\s+((?:[1-3]\\s*)?[\\p{L}]+?)(?:\\s+(?:${CHAPTER_PATTERN}))?\\s+(\\d+)\\b`, "giu")
    normalized = normalized.replace(invertedRegex, (_, verse, book, chap) => {
        const cleanBook = book.trim().replace(new RegExp(`\\s+(?:${CHAPTER_PATTERN})$`, "iu"), "")
        return `${cleanBook} ${chap}:${verse}`
    })

    // 4. Trailing verse ordinal/word: "John chapter 3, the 16th verse" -> "John 3:16"
    const trailingVerseRegex = new RegExp(`\\b((?:[1-3]\\s*)?[\\p{L}]+?)(?:\\s+(?:${CHAPTER_PATTERN}))?\\s+(\\d+)[,\\s]+(?:(?:${THE_PATTERN})\\s+)?(\\d+)\\s+(?:${VERSE_PATTERN})\\b`, "giu")
    normalized = normalized.replace(trailingVerseRegex, (match, book, chap, verse) => {
        const cleanBook = book.trim().replace(new RegExp(`\\s+(?:${CHAPTER_PATTERN})$`, "iu"), "")
        if (!isBook(cleanBook)) return match
        return `${cleanBook} ${chap}:${verse}`
    })

    // 5. Ordinal chapter structure: "the 8th chapter of Romans" -> "Romans 8"
    const ordinalChapterRegex = new RegExp(`\\b(?:(?:${THE_PATTERN})\\s+)?(\\d+)\\s+(?:${CHAPTER_PATTERN}|${PSALM_PATTERN})\\s+(?:${OF_PATTERN})\\s+((?:[1-3]\\s*)?[\\p{L}]+)\\b`, "giu")
    normalized = normalized.replace(ordinalChapterRegex, (all, chapter: string, book: string) => (/\bchapter\b/iu.test(all) ? `${book} chapter ${chapter}` : `${book} ${chapter}`))

    // "John three one six": the verse said a digit at a time
    normalized = normalized.replace(new RegExp(`\\b((?:[1-3]\\s*)?[\\p{L}]+)(?:\\s+(?:${CHAPTER_PATTERN}))?\\s+(\\d{1,3})\\s+(\\d)\\s+(\\d)\\b(?![:\\d])`, "giu"), (match, book: string, chapter: string, first: string, second: string) => {
        const verse = Number(first + second)
        const verses = cacheData.referenceIndex.get(`${book.toLowerCase()} ${chapter}`)?.verseCount || 0
        return verse >= 1 && verse <= verses ? `${book} ${chapter}:${verse}` : match
    })

    // "Jude one three": the 1 is the only chapter, and the verse follows
    const oneChapterRegex = new RegExp(`\\b((?:[1-3]\\s*)?[\\p{L}]+)(?:\\s+(?:${CHAPTER_PATTERN}))?\\s+1\\s+(?:(?:${VERSE_PATTERN})\\s+)?(\\d+(?:-\\d+)?)\\b(?![:\\d])`, "giu")
    normalized = normalized.replace(oneChapterRegex, (match, book, verse) => (isSingleChapterBook(book, cacheData) ? `${book} 1:${verse}` : match))

    // 7. Single-chapter book handler: convert "Philemon verse 6" -> "Philemon 1:6"
    const singleChapterRegex = new RegExp(`\\b((?:[1-3]\\s*)?[\\p{L}]+)\\s+(?:${VERSE_PATTERN})?\\s*(\\d+)\\b(?![:\\d])(?!\\s+(?:${VERSE_PATTERN})\\s*\\d)`, "giu")
    normalized = normalized.replace(singleChapterRegex, (match, book, num) => {
        if (isSingleChapterBook(book, cacheData)) {
            return `${book} 1:${num}`
        }
        return match
    })

    // 8. Standard spoken reference conversion: "Mark chapter 8 and 22", "Mark 8 verse 22" or "Mark 8 and 22" -> "Mark 8:22"
    const standardRefRegex = new RegExp(`\\b((?:[1-3]\\s*)?[\\p{L}]+?)(?:\\s+(?:${CHAPTER_PATTERN}))?\\s+(\\d+)\\s+((?:${JOINER_PATTERN})|(?:${VERSE_PATTERN}))\\s+(\\d+)(?:\\s*(?:[-–—]|${RANGE_PATTERN})\\s*(\\d+))?\\b`, "giu")
    normalized = normalized.replace(standardRefRegex, (match, book, chap, joiner, vStart, vEnd) => {
        const cleanBook = book.trim().replace(new RegExp(`\\s+(?:${CHAPTER_PATTERN})$`, "iu"), "")
        if (!isBook(cleanBook)) return match
        const joinerStr = (joiner || "").toLowerCase()
        const isJoinerWord = new RegExp(`^(?:${JOINER_PATTERN})$`, "i").test(joinerStr)
        // "Genesis 1 and 2" is two chapters, not chapter 1 verse 2
        if (isJoinerWord && Number(vStart) === Number(chap) + 1) return match
        return vEnd ? `${cleanBook} ${chap}:${vStart}-${vEnd}` : `${cleanBook} ${chap}:${vStart}`
    })

    // 9. Safe dot/comma/space reference formatting: convert "John 3.16" or "John 4 7" -> "John 4:7"
    normalized = normalized.replace(/(?<![:\d])\b((?:[1-3]\s*)?[\p{L}]+)\s+(\d+)[.,\s]+(\d+)\b(?!\s*(?:[1-3]\s*)?[\p{L}]+)(?!:)/giu, (match, book, chap, verse) => {
        const refKey = `${book.trim().toLowerCase()} ${chap}`
        if (cacheData.referenceIndex.has(refKey)) {
            return `${book} ${chap}:${verse}`
        }
        return match
    })

    // 10. Split concatenated 3- and 4-digit reference numbers (e.g., "John 316" -> "John 3:16", "Psalms 4610" -> "Psalms 46:10")
    normalized = normalized.replace(/\b((?:[1-3]\s*)?[\p{L}]+)\s+(\d{3,4})\b/giu, (match, book, digits) => {
        // "Psalm 103" is a chapter as it stands
        if (cacheData.referenceIndex.has(`${book.toLowerCase()} ${digits}`)) return match

        // "Luke 2025" is a year, not Luke 20:25
        if (Number(digits) >= 1900 && Number(digits) <= 2100) return match

        let chap = 0
        let verse = 0
        if (digits.length === 3) {
            chap = parseInt(digits.slice(0, 1), 10)
            verse = parseInt(digits.slice(1), 10)
        } else if (digits.length === 4) {
            chap = parseInt(digits.slice(0, 2), 10)
            verse = parseInt(digits.slice(2), 10)
        }

        const refKey = `${book.toLowerCase()} ${chap}`
        const chapterData = cacheData.referenceIndex.get(refKey)

        if (chapterData && verse >= 1 && verse <= chapterData.verseCount) {
            return `${book} ${chap}:${verse}`
        }

        return match
    })

    return normalized
}

// Resolves single-chapter books dynamically using reference index metadata.
function isSingleChapterBook(bookName: string, cacheData: BibleCacheData): boolean {
    const lowerBook = bookName.toLowerCase().trim()
    const chap1Key = `${lowerBook} 1`
    const chap2Key = `${lowerBook} 2`
    return cacheData.referenceIndex.has(chap1Key) && !cacheData.referenceIndex.has(chap2Key)
}

/////

// Parses a scripture reference string
function parseReference(ref: string) {
    // [Book Name] [Chapter]:[StartVerse](-[EndVerse])?
    const regex = /^((?:\d\s+)?[\p{L}\s]+)\s+(\d+):(\d+)(?:-(\d+))?$/u
    const match = ref.trim().match(regex)
    if (!match) return null

    const [, book, rawChapter, rawStart, rawEnd] = match

    const chapter = parseInt(rawChapter, 10)
    const startVerse = parseInt(rawStart, 10)
    const endVerse = rawEnd ? parseInt(rawEnd, 10) : startVerse

    if (chapter <= 0 || startVerse <= 0 || endVerse < startVerse) return null

    return { book: book.trim(), chapter, startVerse, endVerse }
}

/**
 * A reference still being said when it was first heard: "John 3" (offered as 3:1) or
 * "John 3:1" before "John 3:16", and "Romans 8:20" before "Romans 8:28".
 * chapterOnly: no verse had been said, so any verse of the chapter follows from it.
 */
export function isPartOf(partial: string, whole: string, chapterOnly = false): boolean {
    const a = parseReference(partial)
    const b = parseReference(whole)
    if (!a || !b || a.book.toLowerCase() !== b.book.toLowerCase() || a.startVerse === b.startVerse) return false
    // "Psalm 100" before "Psalm 119:105"
    if (a.chapter !== b.chapter) return a.startVerse === 1 && growsInto(a.chapter, b.chapter)
    return (chapterOnly && a.startVerse === 1) || growsInto(a.startVerse, b.startVerse)
}
function growsInto(first: number, full: number) {
    if (full <= first) return false
    return String(full).startsWith(String(first)) || (first % 10 === 0 && full < first + 10) || (first % 100 === 0 && full < first + 100)
}

// checks if containerRef is or has targetRef
// isReferenceWithin("Matthew 7:1-2", "Matthew 7:1-6") = true
// isReferenceWithin("Matthew 7:1-8", "Matthew 7:1-6") = false
export function isReferenceWithin(containerRef: string, targetRef: string): boolean {
    const target = parseReference(targetRef)
    const container = parseReference(containerRef)
    if (!target || !container) return false

    if (target.book.toLowerCase() !== container.book.toLowerCase() || target.chapter !== container.chapter) return false
    if (target.startVerse < container.startVerse) return false
    if (target.endVerse > container.endVerse) return false

    return true
}
