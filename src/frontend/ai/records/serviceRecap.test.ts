import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const app = vi.hoisted(() => ({ slide: null as any, request: vi.fn(async (_channel: string, _request: any, _callback?: unknown, _timeout?: number) => "saved") }))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { outputs: writable({}), shows: writable({}), showsCache: writable({}) }
})
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => ({ out: { slide: app.slide } }) }))
vi.mock("../../components/helpers/setShow", () => ({ loadShows: vi.fn(async () => {}) }))
vi.mock("../../IPC/main", () => ({ requestMain: app.request }))

import { outputs, shows, showsCache } from "../../stores"
import { saveRecap, watchService } from "./serviceRecap"

const at = (time: string) => vi.setSystemTime(new Date(`2026-11-29T${time}:00`))
const put = (time: string, slide: any) => {
    at(time)
    app.slide = slide
    outputs.set({})
}
const verse = (time: string, reference: string) => put(time, { id: "temp", customDynamicValues: { scripture_reference: reference } })
const song = (time: string, id: string, index = 0) => put(time, { id, index })
const library = (id: string, name: string, category: string | null, lines: string[], created = new Date("2026-11-29T09:00:00").getTime()) => {
    shows.update((all) => ({ ...all, [id]: { name, category, timestamps: { created, modified: null, used: null } } }))
    showsCache.update((all: any) => ({ ...all, [id]: { slides: { one: { items: [{ lines: lines.map((value) => ({ text: [{ value }] })) }] } } } }))
}
const saved = () => app.request.mock.calls.at(-1)![1] as { name: string; content: string }

beforeEach(() => {
    vi.useFakeTimers()
    at("09:00")
    app.request.mockClear()
    shows.set({})
    showsCache.set({})
})
afterEach(() => vi.useRealTimers())

describe("the service recap", () => {
    it("says when there is nothing to save yet", async () => {
        watchService()
        expect(await saveRecap()).toBe("empty")
        expect(app.request).not.toHaveBeenCalled()
    })

    it("lists the verses and songs shown with their times, and the points made into a list", async () => {
        watchService()
        library("grace", "Amazing Grace", "song", ["Amazing grace"])
        library("keys", "Three keys", null, ["• Pray", "• Obey"])
        library("welcome", "Welcome", "presentation", ["Welcome"])
        library("old", "Last week's points", null, ["• Old"], new Date("2026-11-22T10:00:00").getTime())

        song("10:00", "welcome")
        song("10:05", "grace")
        song("10:06", "grace", 1)
        put("10:07", null)
        song("10:08", "grace", 2)
        verse("10:30", "John 3:16")
        verse("10:32", "John 3:17")
        // up for a second: taken straight back down
        vi.setSystemTime(new Date("2026-11-29T10:40:00"))
        app.slide = { id: "temp", customDynamicValues: { scripture_reference: "Job 1:1" } }
        outputs.set({})
        vi.advanceTimersByTime(1000)
        app.slide = null
        outputs.set({})
        song("10:45", "keys")

        at("11:00")
        expect(await saveRecap()).toBe("saved")
        const { name, content } = saved()
        expect(name).toBe("Service recap 2026-11-29.txt")
        expect(content).toMatch(/Songs\n10:05[^\n]*Amazing Grace\n\n/)
        expect(content).toMatch(/Verses shown\n10:30[^\n]*John 3:16\n10:32[^\n]*John 3:17\n\n/)
        expect(content).toContain("Main points\nThree keys\n• Pray\n• Obey")
        for (const left of ["Welcome", "Job 1:1", "Last week"]) expect(content).not.toContain(left)
    })

    it("covers today only", async () => {
        watchService()
        at("11:00")
        vi.setSystemTime(new Date("2026-11-30T09:00:00"))
        expect(await saveRecap()).toBe("empty")
    })
})
