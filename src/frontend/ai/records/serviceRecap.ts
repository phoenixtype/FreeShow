// What was on screen today, to save after the service: verses, songs, and the main points
// when they were made into a list. Kept in memory only, until the app is closed.

import { get } from "svelte/store"
import type { SaveResult } from "../../../types/ai/Records"
import { Main } from "../../../types/IPC/Main"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { loadShows } from "../../components/helpers/setShow"
import { requestMain } from "../../IPC/main"
import { outputs, shows, showsCache } from "../../stores"
import { onScreenTitle } from "../components/floating/onScreen"
import { localDay, startOfDay } from "./localDate"

interface OnScreen {
    kind: "verse" | "song"
    title: string
    showId?: string
}

// up for less than this was a slip, or only passed over
const SHORTEST_MS = 4000
const MAX_ENTRIES = 3000

let entries: (OnScreen & { at: number })[] = []
let up = { key: "", since: 0, added: false }

function onScreen(): OnScreen | null {
    const slide = getFirstActiveOutput()?.out?.slide
    if (!slide) return null
    if (slide.id === "temp") {
        const title = onScreenTitle(slide, {})
        return title ? { kind: "verse", title } : null
    }
    const show = get(shows)[slide.id]
    return show && show.category !== "presentation" ? { kind: "song", title: show.name, showId: slide.id } : null
}

function saw(item: OnScreen | null) {
    const key = item ? `${item.kind}:${item.title}` : ""
    if (key === up.key) return

    const now = Date.now()
    if (up.added && now - up.since < SHORTEST_MS) entries.pop()

    // the same thing back after a blank screen is not listed twice
    const last = entries[entries.length - 1]
    const added = !!item && !(last?.kind === item.kind && last.title === item.title)
    if (item && added) entries = [...entries, { ...item, at: now }].slice(-MAX_ENTRIES)
    up = { key, since: now, added }
}

let watching: (() => void) | null = null
export function watchService() {
    watching?.()
    entries = []
    up = { key: "", since: 0, added: false }
    watching = outputs.subscribe(() => saw(onScreen()))
}

// a list made from the points (make_list): every line is a bullet
function bulletLines(showId: string): string[] {
    const lines = Object.values(get(showsCache)[showId]?.slides || {})
        .flatMap((slide) => slide.items || [])
        .flatMap((item) => item?.lines || [])
        .map((line) =>
            (line?.text || [])
                .map((part) => part?.value || "")
                .join("")
                .trim()
        )
        .filter(Boolean)
    return lines.length && lines.every((line) => line.startsWith("•")) ? lines : []
}

/** lists made today, or put on screen today */
async function pointLists(today: number, shown: string[]): Promise<Map<string, string[]>> {
    const made = Object.entries(get(shows))
        .filter(([, show]) => show && !show.category && show.timestamps?.created >= today)
        .map(([id]) => id)
    const ids = [...new Set([...made, ...shown])]
    await loadShows(ids)
    return new Map(ids.map((id) => [id, bulletLines(id)] as const).filter(([, lines]) => lines.length))
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
const section = (title: string, lines: string[]) => (lines.length ? `${title}\n${lines.join("\n")}` : "")

async function recapText(now: Date): Promise<string> {
    const today = startOfDay(now)
    const todays = entries.filter((entry) => entry.at >= today)
    const lists = await pointLists(
        today,
        todays.flatMap((entry) => (entry.showId ? [entry.showId] : []))
    )

    const listed = (kind: OnScreen["kind"]) => todays.filter((entry) => entry.kind === kind && !(entry.showId && lists.has(entry.showId))).map((entry) => `${clock(entry.at)}  ${entry.title}`)
    const points = [...lists].map(([id, lines]) => `${get(shows)[id]?.name || ""}\n${lines.join("\n")}`)
    const sections = [section("Verses shown", listed("verse")), section("Songs", listed("song")), section("Main points", points.length ? [points.join("\n\n")] : [])].filter(Boolean)
    if (!sections.length) return ""

    const date = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    return [`Service recap, ${date}`, ...sections].join("\n\n") + "\n"
}

export async function saveRecap(): Promise<SaveResult | "empty"> {
    const now = new Date()
    const content = await recapText(now)
    if (!content) return "empty"
    // the operator may take a while to choose where
    const result = await requestMain(Main.SERVICE_RECORDS, { action: "save", name: `Service recap ${localDay(now)}.txt`, content }, undefined, 10 * 60_000)
    return result || "failed"
}
