// Turns a spoken navigation command into the verse to show next, relative to
// the scripture on screen. Pure: the caller supplies the position and the
// shape of the book, so this works with any loaded Bible.

import type { CopilotCommand } from "./voiceCommands"

export interface VersePosition {
    chapter: number
    verse: number
}

export interface BookShape {
    chapterCount: number
    /** Number of verses in a chapter, or 0 when the chapter does not exist. */
    verseCount: (chapter: number) => number
}

export function resolveNavigation(command: CopilotCommand, current: VersePosition, book: BookShape): VersePosition | null {
    const { chapter, verse } = current
    const lastVerse = (c: number) => book.verseCount(c)
    const valid = (target: VersePosition) => target.chapter >= 1 && target.chapter <= book.chapterCount && target.verse >= 1 && target.verse <= lastVerse(target.chapter)

    let target: VersePosition
    switch (command.type) {
        case "verse-step": {
            if (command.delta === 1) {
                target = verse < lastVerse(chapter) ? { chapter, verse: verse + 1 } : { chapter: chapter + 1, verse: 1 }
            } else {
                target = verse > 1 ? { chapter, verse: verse - 1 } : { chapter: chapter - 1, verse: lastVerse(chapter - 1) }
            }
            break
        }
        case "first-verse":
            target = { chapter, verse: 1 }
            break
        case "last-verse":
            target = { chapter, verse: lastVerse(chapter) }
            break
        case "chapter-step":
            target = { chapter: chapter + command.delta, verse: 1 }
            break
        case "first-chapter":
            target = { chapter: 1, verse: 1 }
            break
        case "last-chapter":
            target = { chapter: book.chapterCount, verse: 1 }
            break
        case "goto-verse":
            target = { chapter, verse: command.verse }
            break
        case "goto-chapter":
            target = { chapter: command.chapter, verse: command.verse ?? 1 }
            break
    }

    if (!valid(target)) return null
    if (target.chapter === chapter && target.verse === verse) return null
    return target
}
