import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requestMain = vi.fn(async (_channel: string, data: { seal?: string; open?: string }) => (data.seal !== undefined ? `sealed:${[...data.seal].reverse().join("")}` : [...data.open!.slice("sealed:".length)].reverse().join("")))
vi.mock("../IPC/main", () => ({ requestMain: (...args: any[]) => (requestMain as any)(...args) }))

const KEY = "church-library-session"
const session = { access_token: "access-123", refresh_token: "refresh-456", expires_at: 9999999999, email: "a@example.org" }
const kept = new Map<string, string>()

async function load() {
    vi.resetModules()
    return (await import("./connection")).churchLibrary
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
// each test loads the app afresh: let the last one finish first
afterEach(settle)

beforeEach(() => {
    kept.clear()
    vi.stubGlobal("localStorage", { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => kept.set(key, value), removeItem: (key: string) => kept.delete(key) })
    vi.stubGlobal("window", { api: {} })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "access-123", refresh_token: "refresh-456", expires_at: 9999999999 }), text: async () => "" }))
})

describe("the sign-in kept on this computer", () => {
    it("is written encrypted", async () => {
        const library = await load()
        await library.verifySignInCode("a@example.org", "123456")
        expect(kept.get(KEY)).toMatch(/^sealed:/)
        expect(kept.get(KEY)).not.toContain("refresh-456")
        expect(library.getSession()).toEqual(session)
    })

    it("saved plain before is still signed in, and is encrypted", async () => {
        kept.set(KEY, JSON.stringify(session))
        const library = await load()
        expect(library.getSession()).toEqual(session)
        await settle()
        expect(kept.get(KEY)).toMatch(/^sealed:/)
        expect(library.getSession()).toEqual(session)
    })

    it("is opened again after a restart", async () => {
        kept.set(KEY, `sealed:${[...JSON.stringify(session)].reverse().join("")}`)
        const library = await load()
        await settle()
        expect(library.getSession()).toEqual(session)
    })

    it("is gone after signing out, even while it was being encrypted", async () => {
        kept.set(KEY, JSON.stringify(session))
        const library = await load()
        library.getSession()
        await library.signOut()
        await settle()
        expect(kept.has(KEY)).toBe(false)
        expect(library.getSession()).toBeNull()
    })
})
