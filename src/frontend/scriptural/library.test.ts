import { beforeEach, describe, expect, it, vi } from "vitest"
const { requestMain, toasts } = vi.hoisted(() => ({ requestMain: vi.fn(), toasts: [] as string[] }))
vi.mock("../IPC/main", () => ({ requestMain }))
vi.mock("../utils/common", () => ({ newToast: (text: string) => toasts.push(text) }))
vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { activeProject: writable(null), activeShow: writable(null), projects: writable({}), audioFolders: writable({}), mediaFolders: writable({}) }
})
import { get } from "svelte/store"
import { activeProject, activeShow, mediaFolders, projects } from "../stores"
import { addFromLibrary, matchLibrary, type LibraryItem } from "./library"

const make = (label: string, type: LibraryItem["type"], words: string): LibraryItem => ({ id: label, label, type, url: `https://x.org/a/${label}.mp4`, words: `${label} ${words}`.toLowerCase() })
const list = [make("Cross at dawn", "image", "image picture easter"), make("Gold flow", "video", "loop worship"), make("Pad in G", "audio", "sound pad worship")]
const names = (search: string) => matchLibrary(list, search, 10).map((item) => item.label)

describe("matchLibrary", () => {
    it("finds by name, kind and theme", () => {
        expect(names("cross")).toEqual(["Cross at dawn"])
        expect(names("gold loop")).toEqual(["Gold flow"])
        expect(names("sound")).toEqual(["Pad in G"])
        expect(names("worship").sort()).toEqual(["Gold flow", "Pad in G"])
    })
    it("prefers the word typed in full", () => {
        const pads = [make("Worship pad in G flat", "audio", "pad g"), make("Worship pad in G", "audio", "pad g")]
        expect(matchLibrary(pads, "pad in g", 10)[0].label).toBe("Worship pad in G")
    })
    it("needs every word, from its start", () => {
        expect(names("gold easter")).toEqual([])
        expect(names("ross")).toEqual([])
        expect(names(" ")).toEqual([])
    })
})

describe("addFromLibrary", () => {
    beforeEach(() => {
        toasts.length = 0
        activeProject.set(null)
        activeShow.set(null)
        projects.set({ p1: { name: "Sunday", shows: [] } } as any)
    })
    it("puts the saved file in the open service", async () => {
        activeProject.set("p1")
        requestMain.mockResolvedValue({ path: "/media/Gold flow.mp4" })
        await addFromLibrary(list[1])
        expect(Object.values(get(mediaFolders)).map((a) => a.path)).toEqual(["/media"])
        expect(get(projects).p1.shows).toEqual([{ id: "/media/Gold flow.mp4", name: "Gold flow", type: "video" }])
        expect(requestMain.mock.calls[0][1]).toEqual({ source: "https://x.org/a/Gold flow.mp4", name: "Gold flow.mp4", reuse: true })
    })
    it("adds nothing when it could not be saved, and says so", async () => {
        activeProject.set("p1")
        requestMain.mockResolvedValue({ error: "The download was cut off." })
        await addFromLibrary(list[1])
        expect(get(projects).p1.shows).toEqual([])
        expect(get(activeShow)).toBeNull()
        expect(toasts).toContain("The download was cut off.")
    })
})
