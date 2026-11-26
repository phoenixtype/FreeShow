// Where "next verse", "previous verse" and the rest lead from the passage that is up (or open).
// The one place this is worked out, for spoken commands and the Previous and Next buttons alike.

import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { currentScripture, otherTab } from "../agent/presentPassage"
import type { CopilotCommand } from "../scripture/voiceCommands"
import { resolveNavigation } from "../scripture/voiceNavigation"

/** what to present, or null when there is no passage or nowhere to go */
export async function passageStep(command: CopilotCommand): Promise<{ reference: string; content: string; id: string } | null> {
    const { id, reference } = currentScripture()
    if (!id || !reference?.book || !reference.chapters?.length) return null

    const chapter = Number(reference.chapters[reference.chapters.length - 1])
    const verses = (reference.verses?.[reference.verses.length - 1] || []).map((v: string | number) => parseInt(String(v), 10)).filter((v: number) => !isNaN(v))
    // a range is left from its first verse going back, and from its last going on
    const back = command.type === "verse-step" && command.delta < 0
    const verse = verses.length ? (back ? Math.min(...verses) : Math.max(...verses)) : 1

    const book = (await loadJsonBible(id))?.data?.books?.find((b) => Number(b.number) === Number(reference.book))
    if (!book) return null

    const chapterOf = (n: number) => book.chapters.find((c) => Number(c.number) === n)
    const target = resolveNavigation(command, { chapter, verse }, { chapterCount: book.chapters.length, verseCount: (n) => chapterOf(n)?.verses.length || 0 })
    if (!target) return null

    return { reference: `${reference.book}.${target.chapter}.${target.verse}`, content: `${book.name} ${target.chapter}:${target.verse}`, id: otherTab(id) }
}
