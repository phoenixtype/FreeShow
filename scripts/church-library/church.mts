// Sets up a church in the library and loads all its assets from one folder.
// Safe to run again: the church is found by name, songs are matched on their
// source id, media on title and size.
//
//   church.mts setup  <church name> --owner <email> [--from <folder>] [--dry-run]
//   church.mts import <church name|id> <folder> [--dry-run]
//   church.mts invite <church name|id> [--role admin|editor|viewer]
//
// The folder may hold, in any depth:
//   Songs.db + SongWords.db   an EasyWorship 7 library  -> songs
//   *.txt                     one song each (name = title; blank line between sections) -> songs
//   images, video, audio, PDF, PowerPoint, Keynote       -> media (uploaded)
//
// The owner must have signed in to Scriptural Project once, so their account exists.
//
// Needs the service-role key, which bypasses row-level security. Pass it for
// this run only, from 1Password, and never save it in a file:
//   op run --env-file=<(echo 'SUPABASE_URL=op://...') -- npx tsx scripts/church-library/church.mts ...

import Database from "better-sqlite3"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { randomUUID } from "node:crypto"
import { classifyFile, storageName, textSong } from "../../src/frontend/scriptural/churchAssets"
import { cleanEasyWorshipSong } from "../../src/frontend/scriptural/songFormat"

const MAX_MEDIA_BYTES = 500 * 1024 * 1024 // the church-media bucket's limit

const args = process.argv.slice(2)
const flag = (name: string) => {
    const i = args.indexOf(name)
    if (i < 0) return undefined
    return args.splice(i, 2)[1]
}
const dryRun = args.includes("--dry-run")
if (dryRun) args.splice(args.indexOf("--dry-run"), 1)
const owner = flag("--owner")
const from = flag("--from")
const role = flag("--role") || "editor"
const [command, church, folderArg] = args

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const usage = "usage: church.mts setup <name> --owner <email> [--from <folder>] | import <name|id> <folder> | invite <name|id> [--role editor]  (add --dry-run to import nothing)"
if (!command || !church || !["setup", "import", "invite"].includes(command)) fail(usage)
if (command === "setup" && !owner) fail("setup needs --owner <email>")
if (command === "invite" && !["admin", "editor", "viewer"].includes(role)) fail("role must be admin, editor or viewer")
if (!dryRun && (!url || !key)) fail("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for this run")

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

async function api<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<T> {
    const response = await fetch(`${url}${path}`, {
        method: init.method || (init.body || init.raw ? "POST" : "GET"),
        headers: { apikey: key!, Authorization: `Bearer ${key}`, ...(init.raw ? {} : { "Content-Type": "application/json" }), ...init.headers },
        body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
    })
    if (!response.ok) fail(`${init.method || "GET"} ${path.split("?")[0]} failed: ${response.status} ${await response.text()}`)
    const text = await response.text()
    return (text ? JSON.parse(text) : null) as T
}

const isId = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)

async function findChurch(nameOrId: string): Promise<{ id: string; name: string } | null> {
    const filter = isId(nameOrId) ? `id=eq.${nameOrId}` : `name=eq.${encodeURIComponent(nameOrId)}`
    const rows = await api<{ id: string; name: string }[]>(`/rest/v1/churches?select=id,name&${filter}`)
    if (rows.length > 1) fail(`More than one church is called "${nameOrId}"; pass its id.`)
    return rows[0] || null
}

async function findUser(email: string): Promise<string> {
    for (let page = 1; ; page++) {
        const { users } = await api<{ users: { id: string; email?: string }[] }>(`/auth/v1/admin/users?page=${page}&per_page=200`)
        const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (match) return match.id
        if (users.length < 200) fail(`No account for ${email}. They need to sign in to Scriptural Project once first.`)
    }
}

async function setup(name: string, ownerEmail: string): Promise<string> {
    const existing = await findChurch(name)
    if (existing) {
        console.log(`church "${existing.name}" already exists (${existing.id})`)
        return existing.id
    }
    const userId = await findUser(ownerEmail)
    const [created] = await api<{ id: string }[]>("/rest/v1/churches?select=id", { body: { name, created_by: userId }, headers: { Prefer: "return=representation" } })
    await api("/rest/v1/church_members?on_conflict=church_id,user_id", { body: { church_id: created.id, user_id: userId, role: "owner" }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } })
    console.log(`created church "${name}" (${created.id}), owner ${ownerEmail}`)
    return created.id
}

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
}

async function importSongs(churchId: string, folder: string, files: string[]) {
    const rows: any[] = []
    const skipped: string[] = []
    // every row carries every key: a bulk insert needs them identical
    const row = (clean: any, source: string, sourceId: string) => ({ church_id: churchId, source, source_id: sourceId, authors: null, copyright: null, ccli: null, ...JSON.parse(JSON.stringify(clean)) })

    for (const songsDb of files.filter((f) => basename(f) === "Songs.db" && existsSync(join(f, "..", "SongWords.db")))) {
        const dir = join(songsDb, "..")
        const songs = new Database(songsDb, { readonly: true }).prepare("select rowid, song_uid, title, author, copyright, reference_number from song").all() as any[]
        const words = new Map((new Database(join(dir, "SongWords.db"), { readonly: true }).prepare("select song_id, words from word").all() as any[]).map((w) => [w.song_id, w.words]))
        for (const song of songs) {
            const clean = cleanEasyWorshipSong(song, words.get(song.rowid) || "")
            if (clean.sections.length) rows.push(row(clean, "easyworship", song.song_uid))
            else skipped.push(song.title || song.song_uid)
        }
    }
    for (const file of files.filter((f) => classifyFile(basename(f)).role === "song")) {
        const clean = textSong(basename(file), readFileSync(file, "utf8"))
        if (clean) rows.push(row(clean, "file", relative(folder, file)))
        else skipped.push(basename(file))
    }

    console.log(`songs: ${rows.length} ready${skipped.length ? `, ${skipped.length} without words (${skipped.slice(0, 10).join("; ")}${skipped.length > 10 ? "; ..." : ""})` : ""}`)
    if (dryRun) return
    for (let i = 0; i < rows.length; i += 200) {
        await api("/rest/v1/songs?on_conflict=church_id,source,source_id", { body: rows.slice(i, i + 200), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } })
        process.stdout.write(`  ${Math.min(i + 200, rows.length)}/${rows.length}\r`)
    }
}

async function importMedia(churchId: string, folder: string, files: string[]) {
    const media = files.flatMap((file) => {
        const kind = classifyFile(basename(file))
        return kind.role === "media" ? [{ file, ...kind }] : []
    })
    const tooBig = media.filter((m) => statSync(m.file).size > MAX_MEDIA_BYTES)
    const list = media.filter((m) => !tooBig.includes(m))
    console.log(`media: ${list.length} ready${tooBig.length ? `, ${tooBig.length} over 500 MB skipped (${tooBig.map((m) => basename(m.file)).join("; ")})` : ""}`)
    if (dryRun) return

    let uploaded = 0
    let already = 0
    for (const m of list) {
        const bytes = statSync(m.file).size
        const title = basename(m.file).replace(/\.[^.]+$/, "")
        const found = await api<unknown[]>(`/rest/v1/media?select=id&church_id=eq.${churchId}&title=eq.${encodeURIComponent(title)}&bytes=eq.${bytes}&deleted_at=is.null&limit=1`)
        if (found.length) {
            already++
            continue
        }
        const id = randomUUID()
        const path = `${churchId}/${id}/${storageName(basename(m.file))}`
        await api(`/storage/v1/object/church-media/${path.split("/").map(encodeURIComponent).join("/")}`, { raw: readFileSync(m.file), headers: { "Content-Type": m.mime, "x-upsert": "false" } })
        await api("/rest/v1/media", { body: { id, church_id: churchId, kind: m.kind, title, storage_path: path, mime_type: m.mime, bytes }, headers: { Prefer: "return=minimal" } })
        uploaded++
        process.stdout.write(`  ${uploaded + already}/${list.length}\r`)
    }
    console.log(`  uploaded ${uploaded}, already there ${already}`)
}

async function load(churchId: string, folder: string) {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(`${folder} is not a folder`)
    const files = walk(folder)
    await importSongs(churchId, folder, files)
    await importMedia(churchId, folder, files)
}

if (command === "invite") {
    const found = await findChurch(church)
    if (!found) fail(`No church called "${church}".`)
    const [invite] = await api<{ code: string; expires_at: string }[]>("/rest/v1/church_invites?select=code,expires_at", { body: { church_id: found.id, role }, headers: { Prefer: "return=representation" } })
    console.log(`invite code ${invite.code} (${role}), valid until ${invite.expires_at.slice(0, 10)}. Type it under Join in Settings > Church library.`)
} else if (command === "setup") {
    const id = dryRun ? "dry-run" : await setup(church, owner!)
    if (from) await load(id, from)
} else {
    const found = dryRun ? { id: "dry-run" } : await findChurch(church)
    if (!found) fail(`No church called "${church}". Run setup first.`)
    if (!folderArg) fail(usage)
    await load(found.id, folderArg)
}
