import { beforeEach, describe, expect, it, vi } from "vitest"

const added: { id: string; show: any }[][] = []
vi.mock("./importHelpers", () => ({
    // the app's import path: what it saves ends up in the library
    setTempShows: (list: { id: string; show: any }[]) => {
        added.push(list)
        shows.update((a) => ({ ...a, ...Object.fromEntries(list.map(({ id, show }) => [id, { name: show.name, category: show.category }])) }))
    }
}))
vi.mock("../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("./txt", () => ({
    convertText: ({ name, category, text }: any) => ({ id: "random", show: { name, category, text } })
}))
vi.mock("../components/helpers/show", () => ({ formatToFileName: (name: string) => name.replace(/[/\\?%*:|"<>!,.]/g, "").trim() }))
vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { shows: writable({}), categories: writable({ song: { name: "category.song" } }) }
})

import { shows } from "../stores"
import { addStarterHymns } from "./starterSongs"
import { STARTER_HYMNS } from "./starterSongs.data"

beforeEach(() => {
    added.length = 0
    shows.set({})
})

describe("the starter hymns", () => {
    it("are ten to fifteen old public-domain hymns, each with title, author and year", () => {
        expect(STARTER_HYMNS.length).toBeGreaterThanOrEqual(10)
        expect(STARTER_HYMNS.length).toBeLessThanOrEqual(15)
        for (const hymn of STARTER_HYMNS) {
            expect(hymn.title).toBeTruthy()
            expect(hymn.author).toBeTruthy()
            expect(hymn.year).toBeLessThan(1929)
            expect(hymn.words).toMatch(/^\[(Verse|Chorus)\]\n/)
        }
        expect(new Set(STARTER_HYMNS.map((a) => a.title)).size).toBe(STARTER_HYMNS.length)
    })

    it("go into the library as songs, with their details", () => {
        expect(addStarterHymns()).toBe(STARTER_HYMNS.length)
        const grace = added[0].find((a) => a.show.name === "Amazing Grace")!
        expect(grace.show.category).toBe("song")
        expect(grace.show.text).toContain("title=Amazing Grace\nauthor=John Newton\nyear=1779\ncopyright=Public Domain\n\n[Verse]\n")
    })

    it("are not added a second time", () => {
        addStarterHymns()
        expect(addStarterHymns()).toBe(0)
        expect(added.length).toBe(1)
    })

    it("leave a song the church already has by that name alone", () => {
        shows.set({ mine: { name: "amazing grace" } } as any)
        expect(addStarterHymns()).toBe(STARTER_HYMNS.length - 1)
        expect(added[0].some((a) => a.show.name === "Amazing Grace")).toBe(false)
    })
})
