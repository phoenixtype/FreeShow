// Keeps this computer's copy of the church library: songs come down as shows
// in the "Church library" category, only what changed since the last sync,
// and stay usable offline. Changes made in the library online (or on another
// computer) arrive on the next sync.

import { setTempShows } from "../converters/importHelpers"
import { convertText } from "../converters/txt"
import { loadShows } from "../components/helpers/setShow"
import { categories, shows, showsCache } from "../stores"
import { get } from "svelte/store"
import { save } from "../utils/save"
import { churchLibrary, ScripturalError } from "./connection"
import { history } from "../components/helpers/history"
import { showToSong, type SongSection } from "./songFormat"

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
    source: string | null
    source_id: string | null
}

const PAGE_SIZE = 1000
const cursorKey = (churchId: string) => `church-library-synced:${churchId}`

export async function myChurches(): Promise<Church[]> {
    const { data } = await churchLibrary.rest<Church[]>("churches?select=id,name&order=name", { signedIn: true })
    return data || []
}

export async function createChurch(name: string): Promise<string> {
    const { data } = await churchLibrary.rest<string>("rpc/create_church", { method: "POST", body: { church_name: name }, signedIn: true })
    return data
}

export async function joinChurch(code: string): Promise<string> {
    const { data } = await churchLibrary.rest<string>("rpc/join_church", { method: "POST", body: { invite_code: code }, signedIn: true })
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
    // paged by (updated_at, id), not offset: a row edited mid-sync moves to the end instead of shifting a page boundary
    let after = { at: since, id: "" }
    for (;;) {
        const position = after.id ? `or=(updated_at.gt.${encodeURIComponent(after.at)},and(updated_at.eq.${encodeURIComponent(after.at)},id.gt.${after.id}))` : `updated_at=gt.${encodeURIComponent(after.at)}`
        const { data } = await churchLibrary.rest<LibrarySong[]>(`songs?select=id,title,authors,copyright,ccli,sections,arrangement,updated_at,deleted_at,source,source_id&church_id=eq.${churchId}&${position}&order=updated_at.asc,id.asc&limit=${PAGE_SIZE}`, { signedIn: true })
        changed.push(...(data || []))
        onProgress?.(changed.length)
        if (!data || data.length < PAGE_SIZE) break
        const last = data[data.length - 1]
        after = { at: last.updated_at, id: last.id }
    }
    if (!changed.length) return 0

    const categoryId = "church_library"
    categories.update((a) => {
        if (!a[categoryId]) a[categoryId] = { name: "Church library", icon: "song" }
        return a
    })
    // a song first made in the app keeps that id on every computer
    const localId = (song: LibrarySong) => (song.source === "app" && song.source_id ? song.source_id : song.id)

    // deleted in the library: deleted here too
    const removed = changed.filter((song) => song.deleted_at && get(shows)[localId(song)]).map((song) => ({ id: localId(song) }))
    if (removed.length) history({ id: "SHOWS", oldData: { data: removed }, location: { page: "drawer" } })

    const tempShows = changed
        .filter((song) => !song.deleted_at && song.sections.length)
        .map((song) => {
            const { show } = convertText({ name: song.title, category: categoryId, text: songText(song), noFormatting: true, returnData: true, open: false })
            show.name = song.title
            show.origin = "church-library"
            show.meta = { ...show.meta, title: song.title, author: song.authors || "", copyright: song.copyright || "", CCLI: song.ccli || "" }
            return { id: localId(song), show }
        })
    // always the bulk path: a single song must not land in the open project or switch the show on screen
    if (tempShows.length) setTempShows(tempShows, { suppressFinishedToast: true, quiet: true })

    localStorage.setItem(cursorKey(churchId), changed[changed.length - 1].updated_at)
    save()
    return tempShows.length
}

const pushedKey = (churchId: string) => `church-library-pushed:${churchId}`
const isLibraryId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)

/** Sends songs changed or added in the Church library category on this computer. Returns how many went up. */
export async function pushSongs(churchId: string): Promise<number> {
    if (!churchLibrary.getSession()) throw new ScripturalError("Sign in to your church library first.")
    const since = Number(localStorage.getItem(pushedKey(churchId)) || 0)
    // taken before reading: an edit made while this runs is sent next time
    const startedAt = Date.now()
    const changed = Object.entries(get(shows))
        // a song imported into the category has no "modified" until someone edits it
        .filter(([, show]) => show.category === "church_library" && (show.timestamps?.modified || show.timestamps?.created || 0) > since)
        .map(([id]) => id)
    if (!changed.length) return 0

    await loadShows(changed)
    const cache = get(showsCache)
    let sent = 0
    for (const id of changed) {
        const show = cache[id]
        if (!show) continue
        const song = JSON.parse(JSON.stringify(showToSong(show as any)))
        if (!song.sections.length) continue
        const row = { authors: null, copyright: null, ccli: null, ...song }
        if (isLibraryId(id)) {
            const { data } = await churchLibrary.rest<unknown[]>(`songs?id=eq.${id}&church_id=eq.${churchId}&deleted_at=is.null&select=id`, { method: "PATCH", body: row, headers: { Prefer: "return=representation" }, signedIn: true })
            // nothing matched: deleted in the library, or not ours to change
            if (!data?.length) continue
        } else {
            await churchLibrary.rest("songs?on_conflict=church_id,source,source_id", { method: "POST", body: { ...row, church_id: churchId, source: "app", source_id: id }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, signedIn: true })
        }
        sent++
    }
    localStorage.setItem(pushedKey(churchId), String(startedAt))
    return sent
}
