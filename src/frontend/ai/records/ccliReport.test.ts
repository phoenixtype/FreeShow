import { beforeEach, describe, expect, it, vi } from "vitest"

const app = vi.hoisted(() => ({ request: vi.fn(async (_channel: string, _request: any, _callback?: unknown, _timeout?: number) => "saved") }))
vi.mock("../../IPC/main", () => ({ requestMain: app.request }))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { shows: writable({}), usageLog: writable({ all: [] }) }
})

import { shows, usageLog } from "../../stores"
import { ccliCsv, saveCcliReport } from "./ccliReport"

const used = (when: string, name: string, metadata: object = {}) => ({ name, time: new Date(when).getTime(), metadata })
const grace = { CCLI: "22025", author: "John Newton" }
const rows = (csv: string) => csv.replace("﻿", "").trim().split("\r\n")

describe("the CCLI report", () => {
    it("counts each time a song was used between the two dates", () => {
        const log = [
            used("2026-10-31T10:00:00", "Amazing Grace", grace),
            used("2026-11-01T00:05:00", "Amazing Grace", grace),
            // gone back to within the same service
            used("2026-11-01T00:30:00", "Amazing Grace", grace),
            used("2026-11-29T23:55:00", "Amazing Grace", grace),
            used("2026-11-30T09:00:00", "Amazing Grace", grace),
            used("2026-11-08T10:00:00", "Holy, Holy", { artist: 'The "Choir"' })
        ]
        expect(rows(ccliCsv(log, "2026-11-01", "2026-11-29")!)).toEqual(["Title,CCLI number,Author,Times used", "Amazing Grace,22025,John Newton,2", '"Holy, Holy",,"The ""Choir""",1'])
    })

    it("leaves out presentations, and keeps a spreadsheet from running a title", () => {
        const log = [used("2026-11-08T10:00:00", "Announcements"), used("2026-11-08T10:10:00", "=cmd()")]
        expect(rows(ccliCsv(log, "2026-11-01", "2026-11-29", ["Announcements"])!)).toEqual(["Title,CCLI number,Author,Times used", "'=cmd(),,,1"])
    })

    it("is nothing when no song was used then", () => {
        expect(ccliCsv([used("2026-10-08T10:00:00", "Amazing Grace", grace)], "2026-11-01", "2026-11-29")).toBeNull()
    })
})

describe("saving it", () => {
    beforeEach(() => {
        app.request.mockClear()
        shows.set({ news: { name: "Announcements", category: "presentation" } } as any)
        usageLog.set({ all: [used("2026-11-08T10:00:00", "Amazing Grace", grace), used("2026-11-08T10:10:00", "Announcements")] })
    })

    it("asks where to save the file", async () => {
        expect(await saveCcliReport("2026-11-01", "2026-11-29")).toBe("saved")
        const request = app.request.mock.calls[0][1]
        expect(request).toMatchObject({ action: "save", name: "CCLI songs 2026-11-01 to 2026-11-29.csv" })
        expect(request.content).not.toContain("Announcements")
    })

    it("saves nothing when there is nothing to report", async () => {
        expect(await saveCcliReport("2026-01-01", "2026-01-31")).toBe("empty")
        expect(app.request).not.toHaveBeenCalled()
    })
})
