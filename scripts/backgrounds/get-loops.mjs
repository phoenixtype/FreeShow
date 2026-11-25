#!/usr/bin/env node
// Downloads Scriptural's video loops (and, if asked, the still backgrounds) to a
// folder, so a church can keep them on its own computers or import them into
// its church library. No dependencies; Node 20 or newer.
//
//   node scripts/backgrounds/get-loops.mjs [folder] [--category worship] [--ours] [--stills] [--list] [--limit 5]
//
//   folder        where to put them (default ./scriptural-loops)
//   --category    only this category (see --list)
//   --ours        only loops made by Scriptural, free for any church; leaves out the CC0 and
//                 public-domain film cut from Wikimedia Commons
//   --stills      also the pictures
//   --list        show the categories and how many files, download nothing
//   --limit N     stop after N files (to try it)
//
// Run it again any time: files already there at the same size are skipped, and a
// new loop added to the library arrives on the next run. A CREDITS.txt lists who
// made each file and its licence.

import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync, renameSync } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { join, resolve } from "node:path"

const LIBRARY = process.env.SCRIPTURAL_LIBRARY_URL || "https://project.scriptural.online/backgrounds/library.json"
const OURS = "Scriptural"

const args = process.argv.slice(2)
const take = (name) => {
    const i = args.indexOf(name)
    return i < 0 ? undefined : args.splice(i, 2)[1]
}
const has = (name) => {
    const i = args.indexOf(name)
    if (i >= 0) args.splice(i, 1)
    return i >= 0
}
const category = take("--category")
const limit = Number(take("--limit")) || Infinity
const ours = has("--ours")
const stills = has("--stills")
const list = has("--list")
const folder = resolve(args[0] || "scriptural-loops")

const fail = (message) => {
    console.error(message)
    process.exit(1)
}

const response = await fetch(LIBRARY).catch(() => null)
if (!response?.ok) fail("Could not reach the Scriptural library. Check your internet connection and try again.")
const library = await response.json()

const labels = new Map(library.categories.map((c) => [c.id, c.label]))
if (category && !labels.has(category)) fail(`No category "${category}". Categories: ${[...labels.keys()].join(", ")}`)

const wanted = library.items
    .filter((item) => item.type === "video" || (stills && item.type === "image"))
    .filter((item) => !category || item.categories.includes(category))
    .filter((item) => !ours || item.credit === OURS)

if (list) {
    for (const [id, label] of labels) {
        const n = wanted.filter((i) => i.categories.includes(id)).length
        if (n) console.log(`${id.padEnd(14)} ${label} (${n})`)
    }
    console.log(`\n${wanted.length} files${ours ? " made by Scriptural" : ""}${stills ? "" : " (loops only; add --stills for pictures)"}`)
    process.exit(0)
}

mkdirSync(folder, { recursive: true })
const queue = wanted.slice(0, limit)
let done = 0
let skipped = 0
let failed = 0

async function fetchOne(item) {
    const name = item.url.split("/").pop()
    const target = join(folder, name)
    const head = await fetch(item.url, { method: "HEAD" })
    if (!head.ok) throw new Error(`${head.status}`)
    const size = Number(head.headers.get("content-length") || 0)
    if (existsSync(target) && size && statSync(target).size === size) {
        skipped++
        return
    }
    const body = await fetch(item.url)
    if (!body.ok || !body.body) throw new Error(`${body.status}`)
    // written under another name first: a stopped download never leaves a broken file that looks finished
    await pipeline(Readable.fromWeb(body.body), createWriteStream(`${target}.part`))
    renameSync(`${target}.part`, target)
    done++
}

// three at a time: quick, and kind to the server
const workers = Array.from({ length: 3 }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
        try {
            await fetchOne(item)
        } catch (err) {
            failed++
            console.error(`\n${item.label}: ${err.message}`)
        }
        process.stdout.write(`\r${done + skipped + failed}/${wanted.slice(0, limit).length}  `)
    }
})
await Promise.all(workers)

const credits = wanted
    .slice(0, limit)
    .map((i) => `${i.url.split("/").pop()}\t${i.label}\t${i.credit}\t${i.license}`)
    .join("\n")
writeFileSync(join(folder, "CREDITS.txt"), `file\ttitle\tmade by\tlicence\n${credits}\n`)

console.log(`\ndownloaded ${done}, already there ${skipped}${failed ? `, failed ${failed} (run again to retry)` : ""}\nin ${folder}`)
process.exit(failed ? 1 : 0)
