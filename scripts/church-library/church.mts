// Sets up a church in the library and loads all its assets from one folder, as
// the person signed in: no admin key. Part of the Church and Multi-campus plans:
// the database refuses bulk loading for a free church (a platform admin may). Safe to run again:
// the church is found by name, songs are matched on their source id, media on
// title and size.
//
//   church.mts login  <email> [--code 123456]   a code is emailed; run again with it (once per month or so)
//   church.mts setup  <church name> [--from <folder>] [--dry-run]
//   church.mts import <church name|id> <folder> [--dry-run]
//   church.mts invite <church name|id> [--role admin|editor|viewer]
//
// The folder may hold, in any depth:
//   Songs.db + SongWords.db   an EasyWorship 7 library  -> songs
//   *.txt                     one song each (name = title; blank line between sections) -> songs
//   images, video, audio, PDF, PowerPoint, Keynote       -> media (uploaded)
//
// The session is kept in ~/.scriptural/church-cli.json, readable only by you.

import Database from "better-sqlite3"
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { homedir } from "node:os"
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
const from = flag("--from")
const role = flag("--role") || "editor"
const codeArg = flag("--code")
const [command, church, folderArg] = args

// the church library's public address and key: the same ones every copy of the app carries
const url = process.env.SCRIPTURAL_CHURCH_URL || "https://gsrpimdgxepoydbrdlqx.supabase.co"
const anon = process.env.SCRIPTURAL_CHURCH_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcnBpbWRneGVwb3lkYnJkbHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTQxNzIsImV4cCI6MjEwNDAzMDE3Mn0.SFxJPiJaVUx9hM0BEx8BC6tKUbvAymtNTljN2bcvmTw"
const sessionFile = join(homedir(), ".scriptural", "church-cli.json")

const usage = "usage: church.mts login <email> [--code N] | setup <name> [--from <folder>] | import <name|id> <folder> | invite <name|id> [--role editor]  (add --dry-run to import nothing)"
if (!["login", "setup", "import", "invite"].includes(command || "") || !church) fail(usage)
if (command === "invite" && !["admin", "editor", "viewer"].includes(role)) fail("role must be admin, editor or viewer")

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

// SIGN-IN //

interface Session {
    access_token: string
    refresh_token: string
    expires_at: number
    email: string
}

async function auth(path: string, body: object): Promise<any> {
    const response = await fetch(`${url}/auth/v1${path}`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) fail(data?.msg || data?.error_description || data?.message || `Sign-in failed (${response.status})`)
    return data
}

function keep(data: any, email: string): Session {
    const session: Session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600), email }
    mkdirSync(join(homedir(), ".scriptural"), { recursive: true })
    writeFileSync(sessionFile, JSON.stringify(session), { mode: 0o600 })
    chmodSync(sessionFile, 0o600)
    return session
}

async function login(email: string, code?: string) {
    if (!code) {
        await auth("/otp", { email, create_user: true })
        if (!process.stdin.isTTY) {
            console.log(`A code was emailed to ${email}. Run: church.mts login ${email} --code <the code>`)
            return
        }
        const prompt = createInterface({ input: process.stdin, output: process.stdout })
        code = (await prompt.question(`A code was emailed to ${email}. Type it here: `)).trim()
        prompt.close()
    }
    keep(await auth("/verify", { type: "email", email, token: code }), email)
    console.log(`Signed in as ${email}.`)
}

/** A current access token, refreshed when about to expire. */
async function token(): Promise<string> {
    if (!existsSync(sessionFile)) fail("Sign in first: church.mts login <your email>")
    let session: Session = JSON.parse(readFileSync(sessionFile, "utf8"))
    if (session.expires_at - 60 <= Date.now() / 1000) {
        const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) })
        if (!response.ok) fail("Your sign-in has ended. Run: church.mts login <your email>")
        session = keep(await response.json(), session.email)
    }
    return session.access_token
}

const userId = async () => JSON.parse(Buffer.from((await token()).split(".")[1], "base64url").toString()).sub as string

async function api<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<T> {
    const response = await fetch(`${url}${path}`, {
        method: init.method || (init.body || init.raw ? "POST" : "GET"),
        headers: { apikey: anon, Authorization: `Bearer ${await token()}`, ...(init.raw ? {} : { "Content-Type": "application/json" }), ...init.headers },
        body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
    })
    if (!response.ok) {
        const text = await response.text()
        if (response.status === 403 || /row-level security|42501/.test(text)) fail("You need to be an owner, admin or editor of this church to do that.")
        fail(`${init.method || "GET"} ${path.split("?")[0]} failed: ${response.status} ${text}`)
    }
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

const PAID_ONLY = "Setting up a church from the command line is part of the Church and Multi-campus plans. On the free plan, add songs in the app. Plans: https://project.scriptural.online/pricing"

/** Asked of the database, which makes the same check again when anything is written. */
async function mayBulkImport(churchId: string | null): Promise<boolean> {
    return (await api<boolean>("/rest/v1/rpc/can_bulk_import", { body: churchId ? { target: churchId } : {} })) === true
}

async function setup(name: string): Promise<string> {
    // churches the signed-in person belongs to; one with this name is theirs to add to
    const existing = await findChurch(name)
    if (existing) {
        console.log(`church "${existing.name}" already exists (${existing.id})`)
        return existing.id
    }
    const id = await api<string>("/rest/v1/rpc/create_church", { body: { church_name: name } })
    console.log(`created church "${name}" (${id}); you are its owner`)
    return id
}

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
}

async function importSongs(churchId: string, folder: string, files: string[]) {
    const rows: any[] = []
    const skipped: string[] = []
    // every row carries every key: a bulk insert needs them identical
    const row = (clean: any, source: string, sourceId: string) => ({ source, source_id: sourceId, authors: null, copyright: null, ccli: null, ...JSON.parse(JSON.stringify(clean)) })

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
        await api("/rest/v1/rpc/bulk_import_songs", { body: { target: churchId, song_rows: rows.slice(i, i + 200) } })
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
        await api("/rest/v1/rpc/bulk_register_media", { body: { target: churchId, media_id: id, media_kind: m.kind, media_title: title, media_path: path, media_mime: m.mime, file_bytes: bytes } })
        uploaded++
        process.stdout.write(`  ${uploaded + already}/${list.length}\r`)
    }
    console.log(`  uploaded ${uploaded}, already there ${already}`)
}

async function load(churchId: string, folder: string) {
    if (!dryRun && !(await mayBulkImport(churchId))) fail(PAID_ONLY)
    if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(`${folder} is not a folder`)
    const files = walk(folder)
    await importSongs(churchId, folder, files)
    await importMedia(churchId, folder, files)
}

if (command === "login") {
    await login(church!, codeArg)
} else if (command === "invite") {
    const found = await findChurch(church!)
    if (!found) fail(`No church called "${church}" that you belong to.`)
    const [invite] = await api<{ code: string; expires_at: string }[]>("/rest/v1/church_invites?select=code,expires_at", { body: { church_id: found.id, role, created_by: await userId() }, headers: { Prefer: "return=representation" } })
    console.log(`invite code ${invite.code} (${role}), valid until ${invite.expires_at.slice(0, 10)}. Type it under Join in Settings > Church library.`)
} else if (command === "setup") {
    // a church that does not exist yet is on the free plan: only a platform admin may fill it in bulk
    if (from && !dryRun && !(await findChurch(church!)) && !(await mayBulkImport(null))) fail(PAID_ONLY)
    const id = dryRun ? "dry-run" : await setup(church!)
    if (from) await load(id, from)
} else {
    const found = dryRun ? { id: "dry-run" } : await findChurch(church!)
    if (!found) fail(`No church called "${church}" that you belong to. Run setup first.`)
    if (!folderArg) fail(usage)
    await load(found.id, folderArg)
}
