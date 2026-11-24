// The words of a passage in one of the church's Bibles, for showing beside a
// reference before it goes on screen.

import { get } from "svelte/store"
import { loadJsonBible, resolveScriptureReference, sanitizeVerseText } from "../../components/drawer/bible/scripture"
import { drawerTabsData, scriptures } from "../../stores"

export interface Passage {
    reference: string
    version: string
    text: string
}

const MAX_VERSES = 200

const plain = (text: unknown) =>
    sanitizeVerseText(text)
        .replace(/!\{(.*?)\}!/g, "$1")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()

/** null when the reference does not exist in the Bible */
export async function readPassage(reference: string, scriptureId = ""): Promise<Passage | null> {
    const open = scriptureId || get(drawerTabsData).scripture?.activeSubTab || ""
    // the Scripture drawer opens the first Bible when the last one is gone
    const requested = get(scriptures)[open] ? open : Object.keys(get(scriptures))[0] || ""
    const bibleId = get(scriptures)[requested]?.collection?.versions?.[0] || requested
    if (!bibleId) return null

    const resolved = await resolveScriptureReference(reference, bibleId)
    if (!resolved) return null

    try {
        const bible = await loadJsonBible(bibleId)
        const book = await bible?.getBook(resolved.book)
        const chapter = await book?.getChapter(resolved.chapter)
        const wanted = resolved.verses.map(Number).slice(0, MAX_VERSES)
        const verses = (chapter?.data?.verses || []).filter((verse) => wanted.includes(Number(verse.number)))
        if (!verses.length) return null

        const first = verses[0].number
        const last = verses[verses.length - 1].number
        const bookName = (book as any)?.data?.name || (book as any)?.name || reference.replace(/\s+\d.*$/, "")
        return {
            reference: `${bookName} ${resolved.chapter}:${first}${last === first ? "" : `-${last}`}`,
            version: get(scriptures)[bibleId]?.customName || get(scriptures)[bibleId]?.name || "",
            text: verses.map((verse) => plain(verse.text)).join(" ")
        }
    } catch (err) {
        console.warn("Could not read passage", reference, err)
        return null
    }
}
