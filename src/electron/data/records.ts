// Files kept about a service: documents the operator saves, and the detection log.
// The log holds words heard in the room, so it lives in the app's own folder (not in
// Documents, which may be synced online) and old files are deleted.

import { app, BrowserWindow, dialog, shell } from "electron"
import { appendFile, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import type { Detection, RecordsRequest, SaveResult } from "../../types/ai/Records"

const KEEP_DAYS = 90
// a quiet hour ends a service: the next line starts a new file
const SERVICE_GAP_MS = 60 * 60_000
const LOG_FILE = /^detections-.*\.jsonl$/

const logFolder = () => join(app.getPath("userData"), "detection-logs")

export async function serviceRecords(request: RecordsRequest): Promise<SaveResult | void> {
    if (request.action === "save") return save(request.name, request.content)
    try {
        if (request.action === "detection") await append(request.detection)
        else if (request.action === "prune") await prune()
        else if (request.action === "open-detections") {
            await mkdir(logFolder(), { recursive: true })
            await shell.openPath(logFolder())
        }
    } catch (err) {
        console.warn("Detection log:", err)
    }
}

async function save(name: string, content: string): Promise<SaveResult> {
    const fileName = basename(name)
    const extension = extname(fileName).slice(1)
    const options = { defaultPath: join(app.getPath("documents"), fileName), filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [] }
    const window = BrowserWindow.getFocusedWindow()
    const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (chosen.canceled || !chosen.filePath) return "cancelled"

    try {
        await writeFile(chosen.filePath, content, "utf8")
        return "saved"
    } catch (err) {
        console.warn("Could not save", fileName, err)
        return "failed"
    }
}

const two = (n: number) => String(n).padStart(2, "0")
const day = (at: Date) => `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`

let current = { path: "", at: 0 }
// one line after another, in the order they happened
let writing: Promise<unknown> = Promise.resolve()

function append(detection: Detection) {
    const now = new Date()
    const next = writing.then(async () => {
        const folder = logFolder()
        await mkdir(folder, { recursive: true })
        if (!current.path.startsWith(folder) || now.getTime() - current.at > SERVICE_GAP_MS) {
            await prune()
            current.path = join(folder, `detections-${day(now)}_${two(now.getHours())}-${two(now.getMinutes())}.jsonl`)
        }
        current.at = now.getTime()
        const time = `${day(now)} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
        await appendFile(current.path, JSON.stringify({ time, ...detection }) + "\n", "utf8")
    })
    writing = next.catch(() => {})
    return next
}

async function prune() {
    const folder = logFolder()
    const names = await readdir(folder).catch(() => [] as string[])
    const oldest = Date.now() - KEEP_DAYS * 24 * 60 * 60_000
    for (const name of names) {
        if (!LOG_FILE.test(name)) continue
        const path = join(folder, name)
        if ((await stat(path)).mtimeMs < oldest) await unlink(path)
    }
}
