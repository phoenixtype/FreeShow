// Scripture search by wording and by meaning, through Scriptural's
// search-scripture endpoint (public, unmetered, one call per query). Used by
// the Bible search box next to the local word search, which stays instant and
// works offline; this adds the passages a paraphrase points to.

import { bookNumber } from "./download"
import { ANON_KEY, FUNCTIONS_URL } from "./connection"

export interface FoundPassage {
    book: number
    chapter: number
    verse: number
    /** "Luke 15:11-24" or "John 3:16" */
    reference: string
    /** The anchor verse's text in the version searched (KJV by default). */
    text: string
}

const cache = new Map<string, FoundPassage[]>()

/** Passages for a free-text query, best first. Empty when offline or on any failure. */
export async function searchScriptural(query: string, signal?: AbortSignal): Promise<FoundPassage[]> {
    const key = query.trim().toLowerCase()
    if (key.length < 3 || !navigator.onLine) return []
    if (cache.has(key)) return cache.get(key)!

    try {
        const response = await fetch(`${FUNCTIONS_URL}/search-scripture`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ query: key, version: "KJV", limit: 10 }),
            signal
        })
        if (!response.ok) return []
        const { results = [] } = (await response.json()) as { results?: { book: string; chapter: number; verse: number; reference: string; text: string }[] }
        const passages = results.map((r) => ({ book: bookNumber(r.book) || 0, chapter: r.chapter, verse: r.verse, reference: r.reference.replace(/[–—]/g, "-"), text: r.text })).filter((p) => p.book > 0)
        cache.set(key, passages)
        return passages
    } catch {
        return []
    }
}
