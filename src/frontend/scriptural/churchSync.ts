// Keeps this computer's copy of the church library: songs come down as shows
// in the "Church library" category, only what changed since the last sync,
// and stay usable offline. Changes made in the library online (or on another
// computer) arrive on the next sync.

import { uid } from "uid"
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

/** A code someone types under Join to join this church with the role. Owners and admins only. */
export async function createInvite(churchId: string, role: Church["role"] = "editor"): Promise<{ code: string; expiresAt: string }> {
    const { data } = await churchLibrary.rest<{ code: string; expires_at: string }[]>("church_invites?select=code,expires_at", {
        method: "POST",
        body: { church_id: churchId, created_by: myUserId(), role },
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

// u: the library row's updated_at when this computer last saw it
type Synced = SyncedSong & { u?: string }

function readSynced(churchId: string): { [id: string]: Synced } {
    try {
        return JSON.parse(localStorage.getItem(syncedKey(churchId)) || "{}")
    } catch {
        return {}
    }
}
const writeSynced = (churchId: string, synced: { [id: string]: Synced }) => localStorage.setItem(syncedKey(churchId), JSON.stringify(synced))

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
                // an edit here that is not sent yet stays marked as not sent
                synced[id] = { r: remote, l: local === remote ? remote : (synced[id]?.l ?? local!), u: song.updated_at }
            } else if (choice === "later" || inUse(id)) {
                wait(song)
            } else {
                const { show } = convertText({ name: song.title, category: categoryId, text: songText(song), noFormatting: true, returnData: true, open: false })
                show.name = song.title
                show.origin = "church-library"
                show.meta = { ...show.meta, title: song.title, author: song.authors || "", copyright: song.copyright || "", CCLI: song.ccli || "" }
                synced[id] = { r: remote, l: songSignature(JSON.parse(JSON.stringify(showToSong(show)))), u: song.updated_at }
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
// a song first made in the app is known to the library by that id as its source
const songFilter = (churchId: string, id: string) => (isLibraryId(id) ? `id=eq.${id}&church_id=eq.${churchId}` : `church_id=eq.${churchId}&source=eq.app&source_id=eq.${encodeURIComponent(id)}`)

/** The library's copy of one song as it is now, or null when it is gone. */
async function librarySong(churchId: string, id: string): Promise<{ signature: string; updatedAt: string } | null> {
    const { data } = await churchLibrary.rest<LibrarySong[]>(`songs?select=title,authors,copyright,ccli,sections,arrangement,updated_at,deleted_at&${songFilter(churchId, id)}`, { signedIn: true })
    const song = data?.[0]
    if (!song || song.deleted_at) return null
    return { signature: songSignature({ ...song, authors: song.authors || "", copyright: song.copyright || "", ccli: song.ccli || "" }), updatedAt: song.updated_at }
}

// SONGS THE PLAN REFUSED //

// remembered, so pressing Sync again does not ask the server for the same refusal
const REFUSAL_MS = 6 * 60 * 60 * 1000
const refusedKey = (churchId: string) => `church-library-refused:${churchId}`
type Refusals = { [id: string]: { at: number; signature: string; message: string } }
const isPlanRefusal = (message: string) => /plan holds \d+ songs|plan has room for \d+ people/i.test(message)

function readRefusals(churchId: string): Refusals {
    try {
        return JSON.parse(localStorage.getItem(refusedKey(churchId)) || "{}")
    } catch {
        return {}
    }
}
/** After a plan change: refused songs are tried again at the next sync. */
export const forgetRefusals = (churchId: string) => localStorage.removeItem(refusedKey(churchId))

// DELETED SONGS //

// more than this missing at once looks like a lost or moved data folder, not someone deleting songs
const tooManyMissing = (missing: number, known: number) => missing > 3 && missing > known * 0.2

async function removeDeleted(churchId: string, synced: { [id: string]: Synced }): Promise<{ removed: number; held: number; refused: string }> {
    const here = get(shows)
    const missing = Object.keys(synced).filter((id) => !here[id])
    if (!missing.length) return { removed: 0, held: 0, refused: "" }
    if (tooManyMissing(missing.length, Object.keys(synced).length)) return { removed: 0, held: missing.length, refused: "" }

    let removed = 0
    let refused = ""
    for (const id of missing) {
        try {
            let stamp = synced[id].u
            if (!stamp) {
                const there = await librarySong(churchId, id)
                // changed since: the change wins over the delete, and the next pull brings it back
                if (there && there.signature === synced[id].r) stamp = there.updatedAt
            }
            if (stamp) {
                const { data } = await churchLibrary.rest<unknown[]>(`songs?${songFilter(churchId, id)}&deleted_at=is.null&updated_at=eq.${encodeURIComponent(stamp)}&select=updated_at`, { method: "PATCH", body: { deleted_at: new Date().toISOString() }, headers: { Prefer: "return=representation" }, signedIn: true })
                if (data?.length) removed++
            }
        } catch (err) {
            if (!(err instanceof ScripturalError)) throw err
            refused = err.message
            continue
        }
        delete synced[id]
        writeSynced(churchId, synced)
    }
    return { removed, held: 0, refused }
}

// CHANGED IN TWO PLACES //

/** This computer's version stays as a separate song; the next pull puts the library's version in its place. */
function keepAsCopy(id: string): string {
    const show = JSON.parse(JSON.stringify(get(showsCache)[id]))
    const title: string = show.name
    show.name = `${title} (this computer's copy)`
    if (show.meta?.title) show.meta.title = show.name
    // outside the library category, so it is not sent up as another song
    show.category = null
    delete show.origin
    setTempShows([{ id: uid(), show }], { suppressFinishedToast: true, quiet: true, background: true })
    save()
    return title
}

export interface PushResult {
    sent: number
    removed: number
    /** missing here but not deleted from the library, because too many went at once */
    held: number
    /** titles changed on another computer too: this computer's version was kept as a copy */
    conflicts: string[]
    refused: string
    planRefused: boolean
}

/** Sends songs changed, added or deleted in the Church library category on this computer. */
export async function pushSongs(churchId: string): Promise<PushResult> {
    if (!churchLibrary.getSession()) throw new ScripturalError("Sign in to your church library first.")
    const since = Number(localStorage.getItem(pushedKey(churchId)) || 0)
    // taken before reading: an edit made while this runs is sent next time
    const startedAt = Date.now()
    const synced = readSynced(churchId)
    const result: PushResult = { sent: 0, conflicts: [], planRefused: false, ...(await removeDeleted(churchId, synced)) }

    const changed = Object.entries(get(shows))
        // a song imported into the category has no "modified" until someone edits it
        .filter(([, show]) => show.category === "church_library" && (show.timestamps?.modified || show.timestamps?.created || 0) > since)
        .map(([id]) => id)
    if (!changed.length) return result

    const elsewhere = otherChurchSongs(churchId)
    const remembered = readRefusals(churchId)
    const refusals: Refusals = {}
    // the first "the plan is full" of this run: no more songs are added after it
    let full = ""

    for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH)
        await loadShows(batch)

        for (const id of batch) {
            const song = localSong(id)
            if (!song?.sections.length) continue
            const signature = songSignature(song)
            const known = synced[id]
            // the same words as at the last sync: it came from the library, or only its look changed
            if (known?.l === signature) continue
            // another church's song stays with that church
            if (!known && elsewhere.has(id)) continue
            // came from the library before sync kept track, and never edited here
            if (!known && get(shows)[id]?.origin === "church-library" && !get(shows)[id]?.timestamps?.modified) continue

            const before = remembered[id]
            const recent = before && before.signature === signature && Date.now() - before.at < REFUSAL_MS ? before : null
            const adds = !known && !isLibraryId(id)
            if (recent || (full && adds)) {
                refusals[id] = recent || { at: Date.now(), signature, message: full }
                result.refused = refusals[id].message
                result.planRefused = true
                continue
            }

            const row = { authors: null, copyright: null, ccli: null, ...song }
            try {
                let updatedAt: string | undefined
                if (adds) {
                    const { data } = await churchLibrary.rest<{ updated_at: string }[]>("songs?on_conflict=church_id,source,source_id&select=updated_at", { method: "POST", body: { ...row, church_id: churchId, source: "app", source_id: id, deleted_at: null }, headers: { Prefer: "resolution=merge-duplicates,return=representation" }, signedIn: true })
                    updatedAt = data?.[0]?.updated_at
                } else {
                    // changed only if the library still has the version this computer last saw
                    let stamp = known?.u
                    if (!stamp) {
                        const there = await librarySong(churchId, id)
                        // deleted in the library, or not ours to see
                        if (!there) continue
                        if (there.signature === known?.r || there.signature === signature) stamp = there.updatedAt
                    }
                    let changedRows: { updated_at: string }[] = []
                    if (stamp) {
                        const { data } = await churchLibrary.rest<{ updated_at: string }[]>(`songs?${songFilter(churchId, id)}&deleted_at=is.null&updated_at=eq.${encodeURIComponent(stamp)}&select=updated_at`, { method: "PATCH", body: row, headers: { Prefer: "return=representation" }, signedIn: true })
                        changedRows = data || []
                    }
                    if (changedRows.length) updatedAt = changedRows[0].updated_at
                    else {
                        const there = await librarySong(churchId, id)
                        if (!there) continue
                        if (there.signature !== signature) {
                            result.conflicts.push(keepAsCopy(id))
                            // "unchanged here", so the pull takes the library's version
                            synced[id] = { r: "", l: signature }
                            writeSynced(churchId, synced)
                            continue
                        }
                        // the same words arrived from somewhere else
                        updatedAt = there.updatedAt
                    }
                }
                synced[id] = { r: signature, l: signature, u: updatedAt }
            } catch (err) {
                // the library said no to this one: the others still go. Offline stops here.
                if (!(err instanceof ScripturalError)) throw err
                result.refused = err.message
                if (isPlanRefusal(err.message)) {
                    full = err.message
                    result.planRefused = true
                    refusals[id] = { at: Date.now(), signature, message: err.message }
                }
                continue
            }
            // kept as it goes: a sync that stops half way does not send these twice
            writeSynced(churchId, synced)
            result.sent++
        }
        await breathe()
    }
    localStorage.setItem(refusedKey(churchId), JSON.stringify(refusals))
    // left where it was after a refusal, so what was refused is tried again
    if (!result.refused) localStorage.setItem(pushedKey(churchId), String(startedAt))
    return result
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

export type SyncResult = PushResult & { received: number }
const nothingSent: PushResult = { sent: 0, removed: 0, held: 0, conflicts: [], refused: "", planRefused: false }
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
            // a refused song does not hold back what others changed
            const pushed = canWrite ? await pushSongs(churchId) : nothingSent
            const received = await syncSongs(churchId, onProgress, canWrite)
            syncStatus.set({ running: false, at: Date.now(), error: pushed.refused })
            librarySyncPending.set(false)
            return { ...pushed, received }
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
