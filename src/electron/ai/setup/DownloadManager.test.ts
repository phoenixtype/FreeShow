import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock("electron", () => ({ net: { fetch: fetchMock } }))
vi.mock("../../IPC/main", () => ({ sendToMain: vi.fn() }))

import { DownloadManager, missingSpace } from "./DownloadManager"

let dir = ""
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "download-"))
    fetchMock.mockReset()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const reply = (status: number, body: string) => new Response(body, { status, headers: { "content-length": String(body.length) } })
// sends the first bytes, then the line drops
const dropped = (sent: string, total: number) => {
    let first = true
    const body = new ReadableStream({
        async pull(controller) {
            if (!first) {
                // the bytes reach the disk before the line drops
                await new Promise((resolve) => setTimeout(resolve, 50))
                return controller.error(new Error("network lost"))
            }
            first = false
            controller.enqueue(new TextEncoder().encode(sent))
        }
    })
    return new Response(body, { status: 200, headers: { "content-length": String(total) } })
}

describe("a download that was cut off", () => {
    const url = "https://example.test/model.bin"

    it("carries on from where it stopped, even after the app was restarted", async () => {
        const target = path.join(dir, "model.bin")

        fetchMock.mockImplementation(async () => dropped("hello ", 11))
        await expect(new DownloadManager("test").downloadFile(url, target)).rejects.toThrow()
        expect(fs.existsSync(target)).toBe(false)

        fetchMock.mockReset()
        fetchMock.mockResolvedValueOnce(reply(206, "world"))
        // a new manager: nothing is remembered but what is on disk
        await new DownloadManager("test").downloadFile(url, target)

        const [, init] = fetchMock.mock.calls[0]
        expect(init.headers.Range).toMatch(/^bytes=\d+-$/)
        expect(fs.readFileSync(target, "utf8")).toBe("hello world")
        expect(fs.readdirSync(dir)).toEqual(["model.bin"])
    })

    it("does not add to what was left of a different file", async () => {
        const target = path.join(dir, "model.bin")
        fetchMock.mockImplementation(async () => dropped("old ", 11))
        await expect(new DownloadManager("test").downloadFile(url, target)).rejects.toThrow()

        fetchMock.mockReset()
        fetchMock.mockResolvedValueOnce(reply(200, "new"))
        await new DownloadManager("test").downloadFile("https://example.test/v2/model.bin", target)

        expect(fetchMock.mock.calls[0][1].headers.Range).toBeUndefined()
        expect(fs.readFileSync(target, "utf8")).toBe("new")
    })

    it("throws the pieces away when the person cancels", async () => {
        const manager = new DownloadManager("test")
        fetchMock.mockImplementation(async () => {
            manager.cancel()
            throw Object.assign(new Error("aborted"), { name: "AbortError" })
        })
        await expect(manager.downloadFile(url, path.join(dir, "model.bin"))).rejects.toThrow()
        expect(fs.readdirSync(dir)).toEqual([])
    })
})

describe("free disk space", () => {
    const MB = 1_000_000

    it("asks for what is left to download plus some room to spare", () => {
        expect(missingSpace(2000 * MB, 680 * MB)).toBe(0)
        expect(missingSpace(500 * MB, 680 * MB)).toBe(380 * MB)
    })
})
