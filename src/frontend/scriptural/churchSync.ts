// Keeps this computer's copy of the church library: songs come down as shows
// in the "Church library" category, only what changed since the last sync,
// and stay usable offline. Changes made in the library online (or on another
// computer) arrive on the next sync.

import { setTempShows } from "../converters/importHelpers"
import { convertText } from "../converters/txt"
import { loadShows } from "../components/helpers/setShow"
import { activePage, activeShow, categories, outputs, shows, showsCache } from "../stores"
import { get, writable } from "svelte/store"
import { save } from "../utils/save"
import { churchLibrary, ScripturalError } from "./connection"
import { history } from "../components/helpers/history"
import { pullChoice, showToSong, songSignature, type SongSection, type SyncedSong } from "./songFormat"

export interface Church {
    id: string
    name: string
    role: "owner" | "admin" | "editor" | "viewer"
}

// the signed-in account's id, read from its token
function myUserId(): string {
    const token = churchLibrary.getSession()?.access_token || ""
    try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || ""
    } catch {
        return ""
    }
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
    const { data } = await churchLibrary.rest<{ role: Church["role"]; church: { id: string; name: string } }[]>(`church_members?select=role,church:churches(id,name)&user_id=eq.${myUserId()}`, { signedIn: true })
    return (data || [])
        .filter((row) => row.church)
        .map((row) => ({ id: row.church.id, name: row.church.name, role: row.role }))
        .sort((a, b) => a.name.localeCompare(b.name))
}

/** A code someone types under Join to become an editor of this church. Owners and admins only. */
export async function createInvite(churchId: string): Promise<{ code: string; expiresAt: string }> {
    const { data } = await churchLibrary.rest<{ code: string; expires_at: string }[]>("church_invites?select=code,expires_at", {
        method: "POST",
        body: { church_id: churchId, created_by: myUserId(), role: "editor" },
        headers: { Prefer: "return=representation" },
        signedIn: true
    })
    if (!data?.[0]) throw new ScripturalError("The invite could not be made. Try again.")
    return { code: data[0].code, expiresAt: data[0].expires_at }
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

const cursorOverlapMs = 2 * 60 * 1000
const syncedKey = (churchId: string) => `church-library-songs:${churchId}`

function readSynced(churchId: string): { [id: string]: SyncedSong } {
    try {
        return JSON.parse(localStorage.getItem(syncedKey(churchId)) || "{}")
    } catch {
        return {}
    }
}
const writeSynced = (churchId: string, synced: { [id: string]: SyncedSong }) => localStorage.setItem(syncedKey(churchId), JSON.stringify(synced))

// the library category is shared by every church this computer has synced with
function otherChurchSongs(churchId: string): Set<string> {
    const ids = new Set<string>()
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith(syncedKey("")) && key !== syncedKey(churchId)) Object.keys(readSynced(key.slice(syncedKey("").length))).forEach((id) => ids.add(id))
    }
    return ids
}

const localSong = (id: string) => {
    const show = get(showsCache)[id]
    return show ? JSON.parse(JSON.stringify(showToSong(show as any))) : null
}

// on a screen now, or open in the editor: replacing it would change what the room sees or what is being typed
function inUse(id: string): boolean {
    if (get(activePage) === "edit" && get(activeShow)?.id === id) return true
    return Object.values(get(outputs)).some((output) => output.out?.slide?.id === id)
}

// lets the app draw and take clicks between batches of a large library
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))
const BATCH = 25

/** Brings this computer up to date with the church's songs. Returns how many arrived. */
export async function syncSongs(churchId: string, onProgress?: (count: number) => void, canWrite = true): Promise<number> {
    if (!churchLibrary.getSession()) throw new ScripturalError("Sign in to your church library first.")

    const cursor = localStorage.getItem(cursorKey(churchId)) || ""
    // reread a little: a change saved just before the last sync can be stamped earlier than it
    const since = cursor ? new Date(Date.parse(cursor) - cursorOverlapMs).toISOString() : "1970-01-01T00:00:00Z"
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
    // a song first made in the app keeps that id on every computer
    const localId = (song: LibrarySong) => (song.source === "app" && song.source_id ? song.source_id : song.id)
    const synced = readSynced(churchId)
    const removed: { id: string }[] = []
    const tempShows: { id: string; show: any }[] = []
    let firstWaiting = ""
    const wait = (song: LibrarySong) => (firstWaiting ||= song.updated_at)

    for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH)
        await loadShows(batch.map(localId).filter((id) => get(shows)[id]))

        for (const song of batch) {
            const id = localId(song)
            const here = !!get(shows)[id]
            if (song.deleted_at) {
                if (!here) delete synced[id]
                else if (inUse(id)) wait(song)
                else {
                    removed.push({ id })
                    delete synced[id]
                }
                continue
            }
            if (!song.sections.length) continue

            const remote = songSignature({ ...song, authors: song.authors || "", copyright: song.copyright || "", ccli: song.ccli || "" })
            const mine = here ? localSong(id) : null
            const local = mine ? songSignature(mine) : null
            const choice = pullChoice(remote, local, synced[id], canWrite)
            if (choice === "keep") {
                synced[id] = { r: remote, l: local! }
            } else if (choice === "later" || inUse(id)) {
                wait(song)
            } else {
                const { show } = convertText({ name: song.title, category: categoryId, text: songText(song), noFormatting: true, returnData: true, open: false })
                show.name = song.title
                show.origin = "church-library"
                show.meta = { ...show.meta, title: song.title, author: song.authors || "", copyright: song.copyright || "", CCLI: song.ccli || "" }
                synced[id] = { r: remote, l: songSignature(JSON.parse(JSON.stringify(showToSong(show)))) }
                tempShows.push({ id, show })
            }
        }
        await breathe()
    }

    if (removed.length || tempShows.length) {
        categories.update((a) => {
            if (!a[categoryId]) a[categoryId] = { name: "Church library", icon: "song" }
            return a
        })
    }
    // deleted in the library: deleted here too
    if (removed.length) history({ id: "SHOWS", oldData: { data: removed }, location: { page: "drawer" }, save: false })
    // always the bulk path: a single song must not land in the open project or switch the show on screen
    if (tempShows.length) setTempShows(tempShows, { suppressFinishedToast: true, quiet: true, background: true })

    writeSynced(churchId, synced)
    // a song left for later is asked for again next time
    const reached = changed.filter((song) => !firstWaiting || song.updated_at < firstWaiting).pop()?.updated_at
    if (reached && reached > cursor) localStorage.setItem(cursorKey(churchId), reached)
    if (removed.length || tempShows.length) save()
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

    const synced = readSynced(churchId)
    const elsewhere = otherChurchSongs(churchId)
    let sent = 0
    let refused: ScripturalError | null = null
    for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH)
        await loadShows(batch)

        for (const id of batch) {
            const song = localSong(id)
            if (!song?.sections.length) continue
            const signature = songSignature(song)
            // the same words as at the last sync: it came from the library, or only its look changed
            if (synced[id]?.l === signature) continue
            // another church's song stays with that church
            if (!synced[id] && elsewhere.has(id)) continue
            // came from the library before sync kept track, and never edited here
            if (!synced[id] && get(shows)[id]?.origin === "church-library" && !get(shows)[id]?.timestamps?.modified) continue

            const row = { authors: null, copyright: null, ccli: null, ...song }
            try {
                if (isLibraryId(id)) {
                    const { data } = await churchLibrary.rest<unknown[]>(`songs?id=eq.${id}&church_id=eq.${churchId}&deleted_at=is.null&select=id`, { method: "PATCH", body: row, headers: { Prefer: "return=representation" }, signedIn: true })
                    // nothing matched: deleted in the library, or not ours to change
                    if (!data?.length) continue
                } else {
                    await churchLibrary.rest("songs?on_conflict=church_id,source,source_id", { method: "POST", body: { ...row, church_id: churchId, source: "app", source_id: id }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, signedIn: true })
                }
            } catch (err) {
                // the library said no to this one (a full plan, say): the others still go. Offline stops here.
                if (!(err instanceof ScripturalError)) throw err
                refused = err
                continue
            }
            synced[id] = { r: signature, l: signature }
            // kept as it goes: a sync that stops half way does not send these twice
            writeSynced(churchId, synced)
            sent++
        }
        await breathe()
    }
    // left where it was, so what was refused is tried again
    if (refused) throw new PartlySent(refused.message, sent)
    localStorage.setItem(pushedKey(churchId), String(startedAt))
    return sent
}

class PartlySent extends ScripturalError {
    constructor(
        message: string,
        public sent: number
    ) {
        super(message)
    }
}

export interface SyncStatus {
    running: boolean
    /** when the last sync finished well */
    at: number | null
    error: string
}
export const syncStatus = writable<SyncStatus>({ running: false, at: null, error: "" })
/** something here changed since the last sync; the top bar offers "Sync library" until it is pressed */
export const librarySyncPending = writable(false)

type SyncResult = { sent: number; received: number; refused: string }
let current: { churchId: string; result: Promise<SyncResult> } | null = null
/** Sends what changed here, then takes what changed in the library. One at a time: a second call waits for the first. */
export function syncChurch(churchId: string, onProgress?: (count: number) => void): Promise<SyncResult> {
    if (current?.churchId === churchId) return current.result
    // another church is being synced: this one goes after it
    if (current) return current.result.catch(() => null).then(() => syncChurch(churchId, onProgress))
    syncStatus.update((a) => ({ ...a, running: true }))
    const result = (async () => {
        try {
            const church = (await myChurches()).find((c) => c.id === churchId)
            if (!church) throw new ScripturalError("You are no longer in that church library.")
            const canWrite = church.role !== "viewer"
            let sent = 0
            let refused = ""
            if (canWrite) {
                try {
                    sent = await pushSongs(churchId)
                } catch (err) {
                    // a refused song does not hold back what others changed
                    if (!(err instanceof PartlySent)) throw err
                    sent = err.sent
                    refused = err.message
                }
            }
            const received = await syncSongs(churchId, onProgress, canWrite)
            syncStatus.set({ running: false, at: Date.now(), error: refused })
            librarySyncPending.set(false)
            return { sent, received, refused }
        } catch (err) {
            syncStatus.update((a) => ({ ...a, running: false, error: err instanceof ScripturalError ? err.message : "The church library could not be reached. Press Sync to try again." }))
            throw err
        } finally {
            current = null
        }
    })()
    current = { churchId, result }
    return result
}
