import { beforeEach, describe, expect, it, vi } from "vitest"
import { pullChoice, showToSong, songSignature } from "./songFormat"

const server = vi.hoisted(() => ({ calls: [] as { path: string; init: any }[], answer: (_path: string, _init: any): any => [], added: [] as { id: string; show: any }[] }))
vi.mock("./connection", () => {
    class ScripturalError extends Error {}
    const rest = async (path: string, init: any = {}) => {
        server.calls.push({ path, init })
        return { data: server.answer(path, init) }
    }
    return { ScripturalError, churchLibrary: { getSession: () => ({ access_token: "a.e30.b" }), rest } }
})
vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { activePage: writable("show"), activeShow: writable(null), categories: writable({}), outputs: writable({}), shows: writable({}), showsCache: writable({}) }
})
vi.mock("../converters/importHelpers", () => ({ setTempShows: (list: any[]) => server.added.push(...list) }))
vi.mock("../converters/txt", () => ({ convertText: () => ({ show: {} }) }))
vi.mock("../components/helpers/setShow", () => ({ loadShows: async () => null }))
vi.mock("../components/helpers/history", () => ({ history: () => null }))
vi.mock("../utils/save", () => ({ save: () => null }))

import { shows, showsCache } from "../stores"
import { forgetRefusals, pushSongs } from "./churchSync"
import { ScripturalError } from "./connection"

const store: Record<string, string> = {}
vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] })

const song = { title: "Way Maker", sections: [{ label: "Chorus", type: "chorus" as const, lines: ["Way maker", "Miracle worker"] }], arrangement: ["Chorus", "Chorus"] }

describe("songSignature", () => {
    it("is the same for the same words, whatever the sections are called", () => {
        const renamed = { ...song, authors: "", sections: [{ ...song.sections[0], label: "Verse 1" }], arrangement: ["Verse 1", "Verse 1"] }
        expect(songSignature(renamed)).toBe(songSignature(song))
    })

    it("changes with a word, the title or the sung order", () => {
        const first = songSignature(song)
        expect(songSignature({ ...song, title: "Way maker!" })).not.toBe(first)
        expect(songSignature({ ...song, arrangement: ["Chorus"] })).not.toBe(first)
        expect(songSignature({ ...song, sections: [{ ...song.sections[0], lines: ["Way maker"] }] })).not.toBe(first)
    })

    it("matches the show a song becomes, so a song just sent is not taken back", () => {
        const show = { name: "Way Maker", settings: { activeLayout: "a" }, layouts: { a: { slides: [{ id: "s" }, { id: "s" }] } }, slides: { s: { group: "Chorus", items: [{ lines: [{ text: [{ value: "Way maker" }] }, { text: [{ value: "Miracle worker" }] }] }] } } }
        expect(songSignature(showToSong(show))).toBe(songSignature(song))
    })
})

describe("pullChoice", () => {
    const synced = { r: "old", l: "old" }

    it("takes a song this computer does not have", () => expect(pullChoice("new", null, undefined, true)).toBe("apply"))
    it("leaves a copy that already says the same", () => expect(pullChoice("new", "new", synced, true)).toBe("keep"))
    it("leaves this computer's look and edits alone when the library did not change", () => expect(pullChoice("old", "mine", synced, true)).toBe("keep"))
    it("takes the library's change over an untouched copy", () => expect(pullChoice("new", "old", synced, true)).toBe("apply"))
    it("waits when an edit here has not been sent yet", () => expect(pullChoice("new", "mine", synced, true)).toBe("later"))
    it("lets the library win for someone who can only view", () => expect(pullChoice("new", "mine", synced, false)).toBe("apply"))
})

// one slide of words, as the app keeps it
const aShow = (name: string, words: string) => ({ name, category: "church_library", timestamps: { created: 1, modified: Date.now() + 1000 }, settings: { activeLayout: "a" }, layouts: { a: { slides: [{ id: "s" }] } }, slides: { s: { group: "Verse", items: [{ lines: [{ text: [{ value: words }] }] }] } } })
const have = (list: Record<string, any>) => {
    shows.set(list as any)
    showsCache.set(list as any)
}
const signatureOf = (show: any) => songSignature(showToSong(show))
const tracked = (records: object) => localStorage.setItem("church-library-songs:c1", JSON.stringify(records))
const records = () => JSON.parse(localStorage.getItem("church-library-songs:c1") || "{}")
const writes = () => server.calls.filter((c) => c.init.method)
const stamp = "2026-11-26T10:00:00.123456+00:00"
const planFull = () => {
    throw new ScripturalError("The free plan holds 500 songs. Upgrade to add more.")
}

describe("sending songs to the library", () => {
    beforeEach(() => {
        Object.keys(store).forEach((k) => delete store[k])
        server.calls.length = 0
        server.added.length = 0
        server.answer = () => []
        have({})
        vi.restoreAllMocks()
    })

    it("changes a song only if the library still has the version this computer saw", async () => {
        have({ song1: aShow("Way Maker", "new words") })
        tracked({ song1: { r: "old", l: "old", u: stamp } })
        server.answer = () => [{ updated_at: "later" }]
        const done = await pushSongs("c1")
        expect(done.sent).toBe(1)
        expect(writes()[0].path).toContain(`updated_at=eq.${encodeURIComponent(stamp)}`)
        expect(records().song1.u).toBe("later")
    })

    it("keeps this computer's version as a copy when someone else changed the song first", async () => {
        have({ song1: aShow("Way Maker", "my words") })
        tracked({ song1: { r: "old", l: "old", u: stamp } })
        server.answer = (_path, init) => (init.method ? [] : [{ title: "Way Maker", sections: [{ label: "Verse", type: "verse", lines: ["their words"] }], arrangement: ["Verse"], updated_at: "later", deleted_at: null }])
        const done = await pushSongs("c1")
        expect(done.sent).toBe(0)
        expect(done.conflicts).toEqual(["Way Maker"])
        expect(server.added[0].show.name).toBe("Way Maker (this computer's copy)")
        // not in the library category, so the copy is not sent up as another song
        expect(server.added[0].show.category).toBe(null)
        // the next pull takes the library's version
        expect(pullChoice("theirs", records().song1.l, records().song1, true)).toBe("apply")
    })

    it("removes from the library a song deleted here", async () => {
        const kept = aShow("Kept", "words")
        have({ kept })
        tracked({ kept: { r: "x", l: signatureOf(kept), u: stamp }, gone: { r: "y", l: "y", u: stamp } })
        server.answer = () => [{ updated_at: "later" }]
        const done = await pushSongs("c1")
        expect(done.removed).toBe(1)
        expect(writes()).toHaveLength(1)
        expect(writes()[0].path).toContain("source_id=eq.gone")
        expect(writes()[0].init.body.deleted_at).toBeTruthy()
        expect(records().gone).toBeUndefined()
    })

    it("deletes nothing when many songs are missing at once", async () => {
        const kept = aShow("Kept", "words")
        have({ kept })
        const missing = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { r: id, l: id, u: stamp }]))
        tracked({ kept: { r: "x", l: signatureOf(kept), u: stamp }, ...missing })
        const done = await pushSongs("c1")
        expect(done.held).toBe(4)
        expect(writes()).toHaveLength(0)
    })

    it("stops adding after the plan refuses a song, and does not ask again for six hours", async () => {
        have({ one: aShow("One", "1"), two: aShow("Two", "2") })
        server.answer = planFull
        const first = await pushSongs("c1")
        expect(first.planRefused).toBe(true)
        expect(writes()).toHaveLength(1)
        const second = await pushSongs("c1")
        expect(second.refused).toContain("500 songs")
        expect(writes()).toHaveLength(1)
        // after an upgrade they go straight away
        forgetRefusals("c1")
        server.answer = () => [{ updated_at: "later" }]
        expect((await pushSongs("c1")).sent).toBe(2)
    })

    it("tries a refused song again after six hours", async () => {
        have({ one: aShow("One", "1") })
        server.answer = planFull
        await pushSongs("c1")
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 60 * 1000 + 1)
        await pushSongs("c1")
        expect(writes()).toHaveLength(2)
    })
})
