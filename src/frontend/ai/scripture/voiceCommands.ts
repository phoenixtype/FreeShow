// Spoken navigation commands, ported from Scriptural's Live Copilot
// (scriptural.online). They step or jump relative to the scripture on the
// output right now ("Ephesians 1:17", then "go to the beginning" -> 1:1).
//
// Two tiers, tuned against false positives in continuous preaching:
// - Explicit phrases ("next verse", "go to chapter three") match anywhere in
//   an utterance: saying them at all almost always means "move the screen".
// - Bare words ("next", "back", "verse five") are common mid-sentence, so they
//   only count when the whole utterance IS the command.
//
// Version switching is left to BibleVersionDetector, which FreeShow already has.

export type CopilotCommand =
    | { type: "verse-step"; delta: 1 | -1 }
    | { type: "first-verse" } // verse 1 of the current chapter
    | { type: "last-verse" } // final verse of the current chapter
    | { type: "chapter-step"; delta: 1 | -1 }
    | { type: "first-chapter" } // chapter 1, verse 1 — the beginning of the book
    | { type: "last-chapter" } // final chapter of the book, verse 1
    | { type: "goto-verse"; verse: number }
    | { type: "goto-chapter"; chapter: number; verse?: number }

const BARE_NEXT = new Set(["next", "next one", "go next", "forward", "go forward"])
const BARE_BACK = new Set(["back", "go back", "previous", "previous one", "back one", "back up"])
const BARE_BEGINNING = new Set(["beginning", "the beginning", "start over", "from the top"])

const UNITS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19
}
const TENS: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90
}

/** "twenty three" → "23", "one hundred nineteen" → "119". Only rewrites
 *  number words; leaves everything else untouched. */
function normalizeNumberWords(text: string): string {
    const tokens = text.split(" ")
    const out: string[] = []
    let i = 0
    while (i < tokens.length) {
        let value: number | null = null
        let consumed = 0

        // "one hundred [and] nineteen"
        if (UNITS[tokens[i]] !== undefined && tokens[i + 1] === "hundred") {
            value = UNITS[tokens[i]] * 100
            consumed = 2
            let j = i + 2
            if (tokens[j] === "and") j++
            if (tokens[j] !== undefined && TENS[tokens[j]] !== undefined) {
                value += TENS[tokens[j]]
                j++
                if (tokens[j] !== undefined && UNITS[tokens[j]] !== undefined) {
                    value += UNITS[tokens[j]]
                    j++
                }
            } else if (tokens[j] !== undefined && UNITS[tokens[j]] !== undefined) {
                value += UNITS[tokens[j]]
                j++
            }
            consumed = j - i
        } else if (TENS[tokens[i]] !== undefined) {
            value = TENS[tokens[i]]
            consumed = 1
            if (tokens[i + 1] !== undefined && UNITS[tokens[i + 1]] !== undefined) {
                value += UNITS[tokens[i + 1]]
                consumed = 2
            }
        } else if (UNITS[tokens[i]] !== undefined) {
            value = UNITS[tokens[i]]
            consumed = 1
        }

        if (value !== null) {
            out.push(String(value))
            i += consumed
        } else {
            out.push(tokens[i])
            i++
        }
    }
    return out.join(" ")
}

/**
 * Returns the structured navigation command spoken in this transcript chunk,
 * or null when it's ordinary speech.
 */
export function parseCopilotCommand(chunk: string): CopilotCommand | null {
    let t = chunk
        .trim()
        .toLowerCase()
        .replace(/[.,!?;:]/g, "")
        .replace(/\s+/g, " ")
    if (!t) return null
    t = normalizeNumberWords(t)

    // --- Explicit phrases: match anywhere in the utterance ---

    // Jumps to a specific chapter/verse of the current book:
    // "go to chapter 3", "go to chapter 3 verse 16", "go to verse 5".
    const gotoChapter = t.match(/\bgo(?: back)? to chapter (\d{1,3})(?: verse (\d{1,3}))?\b/)
    if (gotoChapter) {
        return {
            type: "goto-chapter",
            chapter: parseInt(gotoChapter[1], 10),
            ...(gotoChapter[2] ? { verse: parseInt(gotoChapter[2], 10) } : {})
        }
    }
    const gotoVerse = t.match(/\bgo(?: back)? to verse (\d{1,3})\b/)
    if (gotoVerse) return { type: "goto-verse", verse: parseInt(gotoVerse[1], 10) }

    // Beginning / end of the book.
    if (/\b(go to the beginning|from the beginning|beginning of the book|start of the book|first chapter)\b/.test(t)) {
        return { type: "first-chapter" }
    }
    if (/\b(last chapter|final chapter|end of the book)\b/.test(t)) {
        return { type: "last-chapter" }
    }

    // Beginning / end of the current chapter.
    if (/\b(first verse|beginning of the chapter|start of the chapter|top of the chapter)\b/.test(t)) {
        return { type: "first-verse" }
    }
    if (/\b(last verse|final verse|end of the chapter)\b/.test(t)) {
        return { type: "last-verse" }
    }

    // Chapter stepping.
    if (/\b(next chapter|following chapter|chapter forward)\b/.test(t)) return { type: "chapter-step", delta: 1 }
    if (/\b(previous chapter|chapter back|back a chapter|back one chapter)\b/.test(t)) return { type: "chapter-step", delta: -1 }

    // Verse stepping.
    if (/\b(next verse|verse forward|following verse)\b/.test(t)) return { type: "verse-step", delta: 1 }
    if (/\b(previous verse|verse back|back a verse|back one verse)\b/.test(t)) return { type: "verse-step", delta: -1 }

    // --- Bare commands: whole utterance only ---

    if (BARE_NEXT.has(t)) return { type: "verse-step", delta: 1 }
    if (BARE_BACK.has(t)) return { type: "verse-step", delta: -1 }
    if (BARE_BEGINNING.has(t)) return { type: "first-chapter" }

    const bareVerse = t.match(/^verse (\d{1,3})$/)
    if (bareVerse) return { type: "goto-verse", verse: parseInt(bareVerse[1], 10) }
    const bareChapter = t.match(/^chapter (\d{1,3})(?: verse (\d{1,3}))?$/)
    if (bareChapter) {
        return {
            type: "goto-chapter",
            chapter: parseInt(bareChapter[1], 10),
            ...(bareChapter[2] ? { verse: parseInt(bareChapter[2], 10) } : {})
        }
    }

    return null
}
