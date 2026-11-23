import { describe, expect, it, vi } from "vitest"

vi.mock("../../IPC/main", () => ({ sendToMain: vi.fn() }))
vi.mock("../../utils/requests", () => ({ httpsRequest: vi.fn() }))
vi.mock("../../data/contentProviders", () => ({ getContentProviderAccess: vi.fn(), setContentProviderAccess: vi.fn() }))
vi.mock("../planningCenter/request", () => ({
    getShow: (songData: any, song: any, sections: any[]) => ({ name: songData.attributes.title, category: "planning_center", meta: { key: song.chord_chart_key }, slides: sections, layouts: {} })
}))

const { templeSongShow, upcomingPlans, templeErrorMessage } = await import("./request")

const plan = (id: string, plan_date: string) => ({ id, title: id, plan_date, status: "published", notes: null, updated_at: "", created_at: "" })

describe("upcomingPlans", () => {
    it("keeps plans from a week back on, soonest first", () => {
        const plans = [plan("far", "2026-12-20"), plan("next", "2026-11-29"), plan("lastweek", "2026-11-17"), plan("old", "2026-11-01")]
        expect(upcomingPlans(plans, "2026-11-23").map((p) => p.id)).toEqual(["lastweek", "next", "far"])
    })
})

describe("templeSongShow", () => {
    it("builds a Temple show from the chart with the song's key", () => {
        const show = templeSongShow({ id: "abc", title: "Amazing Grace", author: "Newton", ccli_number: "22025", default_key: "G", bpm: 70, chord_chart: "{c: Verse 1}\n[G]Amazing grace", notes: null, created_at: "", updated_at: "" })
        expect(show.id).toBe("templesong_abc")
        expect(show.category).toBe("temple")
        expect(show.meta.key).toBe("G")
        expect(show.slides).toEqual([{ label: "Verse 1", lyrics: "[G]Amazing grace" }])
    })
})

describe("templeErrorMessage", () => {
    it("explains a network failure without a status", () => {
        expect(templeErrorMessage(new Error("ENOTFOUND"))).toMatch(/internet/)
    })
})
