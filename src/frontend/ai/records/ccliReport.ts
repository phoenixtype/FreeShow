// A CCLI usage report from the song usage log the app already keeps (output.ts, off unless
// "Log song usage" is on).

import { get } from "svelte/store"
import type { SaveResult } from "../../../types/ai/Records"
import { Main } from "../../../types/IPC/Main"
import { requestMain } from "../../IPC/main"
import { shows, usageLog } from "../../stores"
import { startOfDay } from "./localDate"

interface Usage {
    name?: string
    time: number
    metadata?: { [key: string]: string }
}

// going back to a song within this is the same use of it
const SAME_USE_MS = 60 * 60_000

/** "2026-11-29" as midnight on this computer */
const dateOf = (day: string) => {
    const [year, month, date] = day.split("-").map(Number)
    return new Date(year, month - 1, date)
}

// a cell starting like this would be run as a formula by a spreadsheet
const cell = (value: string | number) => {
    const text = String(value).replace(/^(?=[=+\-@\t])/, "'")
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** from and to are days, both included; null when nothing was used then */
export function ccliCsv(log: Usage[], from: string, to: string, presentations: string[] = []): string | null {
    const start = startOfDay(dateOf(from))
    const last = dateOf(to)
    const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime()

    const songs = new Map<string, { title: string; number: string; author: string; times: number; at: number }>()
    for (const use of [...log].sort((a, b) => a.time - b.time)) {
        if (use.time < start || use.time >= end) continue
        const meta = use.metadata || {}
        const number = String(meta.CCLI || "").trim()
        if (!number && presentations.includes(use.name || "")) continue

        const title = (meta.title || use.name || "").trim()
        const key = number || title.toLowerCase()
        const song = songs.get(key)
        if (!song) songs.set(key, { title, number, author: meta.author || meta.artist || meta.composer || "", times: 1, at: use.time })
        else {
            if (use.time - song.at > SAME_USE_MS) song.times++
            song.at = use.time
        }
    }
    if (!songs.size) return null

    const rows = [...songs.values()].sort((a, b) => a.title.localeCompare(b.title)).map((song) => [song.title, song.number, song.author, song.times])
    // the mark at the start lets Excel read accented names
    return "﻿" + [["Title", "CCLI number", "Author", "Times used"], ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
}

export async function saveCcliReport(from: string, to: string): Promise<SaveResult | "empty"> {
    const presentations = Object.values(get(shows))
        .filter((show) => show?.category === "presentation")
        .map((show) => show.name)
    const content = ccliCsv(get(usageLog).all || [], from, to, presentations)
    if (!content) return "empty"
    const result = await requestMain(Main.SERVICE_RECORDS, { action: "save", name: `CCLI songs ${from} to ${to}.csv`, content }, undefined, 10 * 60_000)
    return result || "failed"
}
