import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const desktop = vi.hoisted(() => ({ folder: "", save: vi.fn(), open: vi.fn(async () => "") }))
vi.mock("electron", () => ({
    app: { getPath: () => desktop.folder },
    BrowserWindow: { getFocusedWindow: () => null },
    dialog: { showSaveDialog: desktop.save },
    shell: { openPath: desktop.open }
}))

import { serviceRecords } from "./records"

const logs = () => join(desktop.folder, "detection-logs")
const heard = { heard: "john three sixteen", tier: "reference" as const, confidence: 98, found: "John 3:16", action: "shown" as const }
const record = (at: string) => {
    vi.setSystemTime(new Date(at))
    return serviceRecords({ action: "detection", detection: heard })
}

beforeEach(() => {
    desktop.folder = mkdtempSync(join(tmpdir(), "records-"))
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
    rmSync(desktop.folder, { recursive: true, force: true })
})

describe("the detection log", () => {
    it("writes one line for each thing detected, in one file for a service", async () => {
        await record("2026-11-29T10:00:00")
        await record("2026-11-29T10:40:00")
        await record("2026-11-29T18:00:00")

        expect(readdirSync(logs()).sort()).toEqual(["detections-2026-11-29_10-00.jsonl", "detections-2026-11-29_18-00.jsonl"])
        const lines = readFileSync(join(logs(), "detections-2026-11-29_10-00.jsonl"), "utf8").trim().split("\n")
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0])).toEqual({ time: "2026-11-29 10:00:00", ...heard })
    })

    it("deletes logs older than 90 days, and nothing else", async () => {
        await record("2026-11-29T10:00:00")
        const age = (name: string, days: number) => {
            writeFileSync(join(logs(), name), "x")
            const when = new Date(Date.now() - days * 24 * 60 * 60_000)
            utimesSync(join(logs(), name), when, when)
        }
        age("detections-old.jsonl", 91)
        age("detections-recent.jsonl", 89)
        age("my notes.txt", 400)

        await serviceRecords({ action: "prune" })
        expect(existsSync(join(logs(), "detections-old.jsonl"))).toBe(false)
        expect(existsSync(join(logs(), "detections-recent.jsonl"))).toBe(true)
        expect(existsSync(join(logs(), "my notes.txt"))).toBe(true)
    })

    it("does not make a folder just by tidying, and opens it when asked", async () => {
        await serviceRecords({ action: "prune" })
        expect(existsSync(logs())).toBe(false)
        await serviceRecords({ action: "open-detections" })
        expect(desktop.open).toHaveBeenCalledWith(logs())
    })
})

describe("saving a document", () => {
    it("writes where the operator chose", async () => {
        const target = join(desktop.folder, "recap.txt")
        desktop.save.mockResolvedValueOnce({ canceled: false, filePath: target })
        expect(await serviceRecords({ action: "save", name: "../Service recap.txt", content: "John 3:16" })).toBe("saved")
        expect(readFileSync(target, "utf8")).toBe("John 3:16")
        expect(desktop.save.mock.calls[0][0].defaultPath).toBe(join(desktop.folder, "Service recap.txt"))
    })

    it("says when it was cancelled or could not be written", async () => {
        desktop.save.mockResolvedValueOnce({ canceled: true, filePath: "" })
        expect(await serviceRecords({ action: "save", name: "a.csv", content: "x" })).toBe("cancelled")
        desktop.save.mockResolvedValueOnce({ canceled: false, filePath: join(desktop.folder, "missing", "a.csv") })
        expect(await serviceRecords({ action: "save", name: "a.csv", content: "x" })).toBe("failed")
    })
})
