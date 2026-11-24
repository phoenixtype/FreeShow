import { createHash } from "crypto"
import { expect, it, vi } from "vitest"
vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }))
import { browserSignIn, cancelBrowserSignIn } from "./browserSignIn"

const projectUrl = "https://abcdefghijklmnopqrst.supabase.co"
// what the browser is sent to, read back
function start() {
    let opened!: (url: URL) => void
    const url = new Promise<URL>((resolve) => (opened = resolve))
    const answer = browserSignIn({ projectUrl }, async (href) => opened(new URL(href)))
    return { url, answer }
}
const visit = (landing: URL, query: string, key = landing.searchParams.get("key")) => fetch(`http://127.0.0.1:${landing.searchParams.get("port")}/${key}${query}`, { redirect: "manual" })

it("brings back the code with the verifier the browser never saw", async () => {
    const { url, answer } = start()
    const authorize = await url
    const landing = new URL(authorize.searchParams.get("redirect_to")!)
    expect(landing.origin).toBe("https://project.scriptural.online")
    expect((await visit(landing, "?code=abc", "wrong")).status).toBe(404)
    expect((await visit(landing, "?code=abc")).headers.get("location")).toContain("done=1")
    const { code, verifier } = await answer
    expect(code).toBe("abc")
    expect(authorize.toString()).not.toContain(verifier!)
    expect(createHash("sha256").update(verifier!).digest("base64url")).toBe(authorize.searchParams.get("code_challenge"))
})

it("ends when the person says no, or presses cancel", async () => {
    const first = start()
    await visit(new URL((await first.url).searchParams.get("redirect_to")!), "?error=access_denied")
    expect(await first.answer).toEqual({ error: "cancelled" })
    const second = start()
    await second.url
    cancelBrowserSignIn()
    expect(await second.answer).toEqual({ error: "cancelled" })
})

it("opens nothing but a Supabase project", async () => {
    const open = vi.fn()
    expect(await browserSignIn({ projectUrl: "https://evil.example" }, open)).toEqual({ error: "failed" })
    expect(open).not.toHaveBeenCalled()
})
