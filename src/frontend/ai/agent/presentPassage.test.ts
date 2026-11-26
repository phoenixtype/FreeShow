import { beforeEach, describe, expect, it, vi } from "vitest"
const open = vi.hoisted(() => ({ drawer: false, locked: false }))
const calls = vi.hoisted(() => ({ start: vi.fn(), resolve: vi.fn(async () => ({ book: 43, chapter: 3, verses: [16] })), play: vi.fn(), tab: vi.fn() }))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return {
        scriptures: writable({ ancient: { name: "Other ancient writings", ancientWritings: true }, kjv: { name: "KJV" } }),
        drawerTabsData: writable({ scripture: { activeSubTab: "ancient" } }),
        activeScripture: writable({}),
        outLocked: { subscribe: (run: any) => (run(open.locked), () => {}) }
    }
})
vi.mock("../../components/actions/apiHelper", () => ({ resolveScriptureRequest: calls.resolve, startScripture: calls.start }))
vi.mock("../../components/drawer/bible/scripture", () => ({ playScripture: calls.play, scriptureDrawerOpen: { subscribe: (run: any) => (run(open.drawer), () => {}) }, screenScripture: { subscribe: (run: any) => (run({}), () => {}) } }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: calls.tab }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null }))
import { presentPassage } from "./presentPassage"

describe("the ancient writings are only ever shown by hand", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        open.drawer = false
        open.locked = false
    })

    it("reads another Bible when a verse is asked for while their tab is open", async () => {
        expect(await presentPassage("John 3:16")).toBe(true)
        expect(calls.resolve).toHaveBeenCalledWith({ reference: "John 3:16", id: "kjv" })
    })
    it("does the same with the Scripture tab open", async () => {
        open.drawer = true
        expect(await presentPassage("John 3:16")).toBe(true)
        expect(calls.start).toHaveBeenCalledWith({ reference: "John 3:16", id: "kjv" })
    })
    it("refuses them by id or by their book numbers", async () => {
        expect(await presentPassage("John 3:16", "ancient")).toBe(false)
        expect(await presentPassage("201.1.1")).toBe(false)
        expect(calls.start).not.toHaveBeenCalled()
        expect(calls.play).not.toHaveBeenCalled()
    })
})
