import { beforeEach, describe, expect, it, vi } from "vitest"
const session = { value: null as object | null }
vi.mock("../stores", async () => ({ saved: (await import("svelte/store")).writable(true) }))
vi.mock("./connection", () => ({ churchLibrary: { getSession: () => session.value } }))
vi.mock("./churchSync", async () => ({ librarySyncPending: (await import("svelte/store")).writable(false) }))
vi.mock("./ai", () => ({ ACTIVE_CHURCH_KEY: "church-library-active" }))
import { get } from "svelte/store"
import { saved } from "../stores"
import { markChangedOnSave, watchLibraryChanges } from "./autoSync"
import { librarySyncPending } from "./churchSync"

const store = new Map<string, string>()
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })

describe("church library sync", () => {
    beforeEach(() => {
        librarySyncPending.set(false)
        store.clear()
        session.value = null
    })
    it("never starts by itself: a save only marks the library as changed", () => {
        store.set("church-library-active", "c1")
        session.value = {}
        watchLibraryChanges()
        // the value at launch is not a save
        expect(get(librarySyncPending)).toBe(false)
        saved.set(false)
        saved.set(true)
        expect(get(librarySyncPending)).toBe(true)
    })
    it("marks nothing when no church is chosen or no one is signed in", () => {
        markChangedOnSave(true)
        store.set("church-library-active", "c1")
        markChangedOnSave(true)
        expect(get(librarySyncPending)).toBe(false)
    })
})
