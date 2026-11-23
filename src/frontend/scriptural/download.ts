// Downloads a whole Scriptural Bible version and keeps it as a local Bible, so
// it works offline in the meeting room and live detection can search it.

import { uid } from "uid"
import { defaultBibleBookNames } from "../converters/bebliaBible"
import { scriptures, scripturesCache } from "../stores"
import { save } from "../utils/save"
import { get } from "svelte/store"
import { ACTIVE_CHURCH_KEY } from "./ai"
import { churchLibrary, restGet, ScripturalError } from "./connection"
import type { ScripturalVersion } from "./versions"

// PostgREST returns at most 1000 rows a request, whatever range is asked for.
const PAGE_SIZE = 1000
// A whole version is ~31,000 rows from a shared production database: a few pages at a time.
const CONCURRENCY = 3

interface VerseRow {
    book: string
    chapter: number
    verse: number
    text: string
}

const BOOK_NUMBERS: Record<string, number> = Object.fromEntries(Object.entries(defaultBibleBookNames).map(([number, name]) => [String(name).toLowerCase(), Number(number)]))
BOOK_NUMBERS.psalms = 19

export function bookNumber(name: string): number | null {
    return BOOK_NUMBERS[name.toLowerCase()] ?? null
}

/** Rows in canonical order, grouped into the json-bible shape FreeShow reads. */
export function toBible(version: ScripturalVersion, rows: VerseRow[]) {
    const books = new Map<number, { number: number; name: string; chapters: Map<number, { number: number; text: string }[]> }>()
    for (const row of rows) {
        const number = bookNumber(row.book)
        if (!number || !row.text?.trim()) continue
        if (!books.has(number)) books.set(number, { number, name: row.book, chapters: new Map() })
        const chapters = books.get(number)!.chapters
        if (!chapters.has(row.chapter)) chapters.set(row.chapter, [])
        chapters.get(row.chapter)!.push({ number: row.verse, text: row.text })
    }

    return {
        name: version.name,
        abbreviation: version.code,
        metadata: { title: version.name, identifier: version.code, language: version.language, copyright: version.copyright || "", source: "Scriptural" },
        books: [...books.values()]
            .sort((a, b) => a.number - b.number)
            .map((book) => ({
                number: book.number,
                name: book.name,
                chapters: [...book.chapters.entries()].sort(([a], [b]) => a - b).map(([number, verses]) => ({ number, verses: verses.sort((a, b) => a.number - b.number) }))
            }))
    }
}

async function countRows(code: string): Promise<number> {
    const { response } = await restGet<unknown[]>(`bible_verses?select=verse&version=eq.${code}&limit=1`, { Prefer: "count=exact" })
    const total = Number(response.headers.get("content-range")?.split("/")[1])
    return Number.isFinite(total) ? total : 0
}

async function fetchPage(code: string, from: number): Promise<VerseRow[]> {
    // ordered like the unique index (version, book, chapter, verse), so paging is stable
    const { data } = await restGet<VerseRow[]>(`bible_verses?select=book,chapter,verse,text&version=eq.${code}&order=book.asc,chapter.asc,verse.asc&offset=${from}&limit=${PAGE_SIZE}`)
    return data
}

/** The local Bible id already holding this version, if it was downloaded before. */
export function downloadedId(code: string): string | null {
    return Object.entries(get(scriptures)).find(([, s]: any) => s?.scripturalVersion === code)?.[0] || null
}

/** A licensed version, through the church library once Samuel has granted it to the church. */
async function licensedRows(version: ScripturalVersion): Promise<VerseRow[]> {
    const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY)
    if (!churchId || !churchLibrary.getSession()) throw new ScripturalError("Sign in to your church library first (Import > Church library).")
    const { ok, data } = await churchLibrary.invoke<{ rows?: VerseRow[]; message?: string }>("bible-download", { churchId, version: version.code })
    if (!ok || !data.rows) throw new ScripturalError(data.message || "This version could not be downloaded.")
    return data.rows
}

export async function downloadVersion(version: ScripturalVersion, onProgress: (fraction: number) => void): Promise<void> {
    if (version.licensed) {
        onProgress(0.1)
        return storeBible(version, toBible(version, await licensedRows(version)))
    }

    const total = await countRows(version.code)
    if (!total) throw new ScripturalError("This version is not available right now.")

    const offsets = Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => i * PAGE_SIZE)
    const pages: VerseRow[][] = new Array(offsets.length)
    let done = 0
    let next = 0
    const worker = async () => {
        while (next < offsets.length) {
            const index = next++
            pages[index] = await fetchPage(version.code, offsets[index])
            onProgress(++done / offsets.length)
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, worker))

    storeBible(version, toBible(version, pages.flat()))
}

function storeBible(version: ScripturalVersion, bible: ReturnType<typeof toBible>) {
    if (!bible.books.length) throw new ScripturalError("Nothing was downloaded. Try again.")

    // replace an earlier download of the same version in place
    const id = downloadedId(version.code) || uid()
    scripturesCache.update((a) => {
        a[id] = bible as any
        return a
    })
    scriptures.update((a) => {
        a[id] = {
            name: version.name,
            id,
            scripturalVersion: version.code,
            ...(version.licensed && version.copyright ? { attributionRequired: true, attributionString: `${version.code}. ${version.copyright}` } : {})
        } as any
        return a
    })

    // a whole version is too much to lose to a crash before the next autosave
    save()
}
