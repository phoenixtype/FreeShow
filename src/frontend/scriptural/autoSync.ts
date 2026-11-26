// Keeps the church library in step without anyone pressing Sync: when the app
// opens, after a save, when the internet comes back, and every few minutes.
// Offline or signed out, it does nothing and the local copy carries on.

import { saved } from "../stores"
import { ACTIVE_CHURCH_KEY } from "./ai"
import { syncChurch } from "./churchSync"
import { churchLibrary } from "./connection"

const EVERY_MS = 5 * 60 * 1000
// after a save, so a run of edits goes up once
const AFTER_SAVE_MS = 20_000
const AFTER_START_MS = 10_000

let timer: ReturnType<typeof setTimeout> | null = null
let dueAt = Infinity

// the sooner of what is already planned and this
function syncIn(ms: number) {
    if (Date.now() + ms >= dueAt) return
    if (timer) clearTimeout(timer)
    dueAt = Date.now() + ms
    timer = setTimeout(run, ms)
}

async function run() {
    timer = null
    dueAt = Infinity
    const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY)
    // the failure is kept in syncStatus, where the church library window shows it
    if (churchId && navigator.onLine && churchLibrary.getSession()) await syncChurch(churchId).catch((err) => console.warn("Church library sync:", err?.message || err))
    syncIn(EVERY_MS)
}

let started = false
export function startAutoSync() {
    if (started) return
    started = true

    window.addEventListener("online", () => syncIn(2000))
    saved.subscribe((isSaved) => isSaved && syncIn(AFTER_SAVE_MS))
    syncIn(AFTER_START_MS)
}
