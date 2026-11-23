// Loads an EasyWorship 7 song library into a church's library, cleaned into
// labelled sections. Safe to run again: songs are matched on their
// EasyWorship id and updated in place.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/church-library/import-easyworship.mts <church id> <folder with Songs.db and SongWords.db> [--dry-run]
//
// The service-role key bypasses row-level security, so pass it in the
// environment for this run only; never save it in a file.

import Database from "better-sqlite3"
import { join } from "node:path"
import { cleanEasyWorshipSong } from "../../src/frontend/scriptural/songFormat"

const [churchId, folder, flag] = process.argv.slice(2)
const dryRun = flag === "--dry-run"
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!churchId || !folder || (!dryRun && (!url || !key))) {
    console.error("usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... import-easyworship.mts <church id> <EW folder> [--dry-run]")
    process.exit(1)
}

const songs = new Database(join(folder, "Songs.db"), { readonly: true }).prepare("select rowid, song_uid, title, author, copyright, reference_number from song").all() as any[]
const words = new Map((new Database(join(folder, "SongWords.db"), { readonly: true }).prepare("select song_id, words from word").all() as any[]).map((w) => [w.song_id, w.words]))

const rows: any[] = []
const skipped: string[] = []
for (const song of songs) {
    const clean = JSON.parse(JSON.stringify(cleanEasyWorshipSong(song, words.get(song.rowid) || "")))
    if (!clean.sections.length) {
        skipped.push(song.title || song.song_uid)
        continue
    }
    // every row carries every key: a bulk insert needs them identical
    rows.push({ church_id: churchId, source: "easyworship", source_id: song.song_uid, authors: null, copyright: null, ccli: null, ...clean })
}

console.log(`${rows.length} songs ready, ${skipped.length} without words: ${skipped.join("; ")}`)
if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 2), null, 2))
    process.exit(0)
}

for (let i = 0; i < rows.length; i += 200) {
    const response = await fetch(`${url}/rest/v1/songs?on_conflict=church_id,source,source_id`, {
        method: "POST",
        headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(i, i + 200))
    })
    if (!response.ok) {
        console.error(`batch at ${i} failed: ${response.status} ${await response.text()}`)
        process.exit(1)
    }
    process.stdout.write(`${Math.min(i + 200, rows.length)}/${rows.length}\r`)
}
console.log(`\nimported ${rows.length} songs`)
