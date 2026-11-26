import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const media = mkdtempSync(path.join(tmpdir(), "agent-media-"))
const requestToMain = vi.fn()

vi.mock("electron", () => ({ app: { getVersion: () => "1" }, nativeImage: {} }))
vi.mock("../IPC/main", () => ({ requestToMain: (...args: unknown[]) => requestToMain(...args) }))
vi.mock("../output/OutputHelper", () => ({ OutputHelper: {} }))
vi.mock("../utils/files", () => ({ getDataFolderPath: () => media }))
vi.mock("../utils/helpers", () => ({ wait: async () => undefined }))

const { answerMessages, mcpApp, saveMedia } = await import("./agentServer")

const answer = (type: string) => new Response("bytes", { headers: { "content-type": type } })
const fetched = vi.fn()

beforeEach(() => {
    requestToMain.mockResolvedValue({ ok: true, result: {} })
    fetched.mockResolvedValue(answer("image/jpeg"))
    vi.stubGlobal("fetch", fetched)
})
afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})
afterAll(() => rmSync(media, { recursive: true, force: true }))

describe("add_media from an agent", () => {
    it("does not follow a web address somewhere else", async () => {
        await mcpApp.call("add_media", { source: "https://example.org/a.jpg" })
        expect(fetched.mock.calls[0][1].redirect).toBe("error")
    })

    it("refuses a page or anything else that is not media", async () => {
        fetched.mockResolvedValue(answer("text/html; charset=utf-8"))
        const before = readdirSync(media).length
        expect((await saveMedia({ source: "https://example.org/page.jpg" })).error).toBe("That address did not send a picture, video, sound, PDF or slide deck.")
        expect(readdirSync(media).length).toBe(before)
    })

    it("does not take .key files", async () => {
        expect((await saveMedia({ source: "/Users/someone/server.key" })).error).toContain("Only pictures")
    })

    it("never puts a file from the web straight on screen", async () => {
        const result: any = await mcpApp.call("add_media", { source: "https://example.org/b.jpg", show: true })
        expect(requestToMain).not.toHaveBeenCalled()
        expect(result.content[0].text).toContain('"shown": false')
        expect(result.content[0].text).toContain("not shown")
    })
})

describe("a batch of requests", () => {
    it("runs one at a time, in order", async () => {
        let running = 0
        let most = 0
        const slow = {
            version: "1",
            tools: async () => [{ name: "add_song", description: "x", inputSchema: { type: "object" as const, properties: {} } }],
            call: async () => {
                most = Math.max(most, ++running)
                await new Promise((resolve) => setTimeout(resolve, 5))
                running--
                return { content: [] }
            }
        }
        const call = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "add_song", arguments: {} } })
        const replies = await answerMessages([call(1), call(2), call(3)], slow)
        expect(replies.map((reply: any) => reply.id)).toEqual([1, 2, 3])
        expect(most).toBe(1)
    })
})
