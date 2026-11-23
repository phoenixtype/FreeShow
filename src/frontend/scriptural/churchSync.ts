// Keeps this computer's copy of the church library: songs come down as shows
// in the "Church library" category, only what changed since the last sync,
// and stay usable offline. Changes made in the library online (or on another
// computer) arrive on the next sync.

import { setTempShows } from "../converters/importHelpers"
import { convertText } from "../converters/txt"
import { categories } from "../stores"
import { save } from "../utils/save"
import { churchLibrary, ScripturalError } from "./connection"
import type { SongSection } from "./songFormat"

export interface Church {
    id: string
    name: string
}

interface LibrarySong {
    id: string
    title: string
    authors: string | null
    copyright: string | null
    ccli: string | null
    sections: SongSection[]
    arrangement: string[]
    updated_at: string
    deleted_at: string | null
}

const PAGE_SIZE = 1000
const cursorKey = (churchId: string) => `church-library-synced:${churchId}`

export async function myChurches(): Promise<Church[]> {
    const { data } = await churchLibrary.rest<Church[]>("churches?select=id,name&order=name")
    return data || []
}

export async function createChurch(name: string): Promise<string> {
    const { data } = await churchLibrary.rest<string>("rpc/create_church", { method: "POST", body: { church_name: name } })
    return data
}

export async function joinChurch(code: string): Promise<string> {
    const { data } = await churchLibrary.rest<string>("rpc/join_church", { method: "POST", body: { invite_code: code } })
    return data
}

/** The song as the plain text the app's own text import reads: sections in the order they are sung. */
export function songText(song: Pick<LibrarySong, "sections" | "arrangement">): string {
    const byLabel = new Map(song.sections.map((s) => [s.label, s]))
    const order = song.arrangement.length ? song.arrangement : song.sections.map((s) => s.label)
    return order
        .map((label) => byLabel.get(label))
        .filter((s): s is SongSection => !!s)
        .map((s) => `[${s.label}]\n${s.lines.join("\n")}`)
        .join("\n\n")
}

/** Brings this computer up to date with the church's songs. Returns how many arrived. */
export async function syncSongs(churchId: string, onProgress?: (count: number) => void): Promise<number> {
    if (!churchLibrary.getSession()) throw new ScripturalError("Sign in to your church library first.")

    const since = localStorage.getItem(cursorKey(churchId)) || "1970-01-01T00:00:00Z"
    const changed: LibrarySong[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data } = await churchLibrary.rest<LibrarySong[]>(`songs?select=id,title,authors,copyright,ccli,sections,arrangement,updated_at,deleted_at&church_id=eq.${churchId}&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc,id.asc&offset=${offset}&limit=${PAGE_SIZE}`)
        changed.push(...(data || []))
        onProgress?.(changed.length)
        if (!data || data.length < PAGE_SIZE) break
    }
    if (!changed.length) return 0

    const categoryId = "church_library"
    categories.update((a) => {
        if (!a[categoryId]) a[categoryId] = { name: "Church library", icon: "song" }
        return a
    })
    const tempShows = changed
        .filter((song) => !song.deleted_at && song.sections.length)
        .map((song) => {
            const { show } = convertText({ name: song.title, category: categoryId, text: songText(song), noFormatting: true, returnData: true, open: false })
            show.name = song.title
            show.origin = "church-library"
            show.meta = { ...show.meta, title: song.title, author: song.authors || "", copyright: song.copyright || "", CCLI: song.ccli || "" }
            return { id: song.id, show }
        })
    if (tempShows.length) setTempShows(tempShows, { suppressFinishedToast: true })

    localStorage.setItem(cursorKey(churchId), changed[changed.length - 1].updated_at)
    save()
    return tempShows.length
}
