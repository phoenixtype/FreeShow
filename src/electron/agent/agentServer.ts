// The app's own MCP server: an AI agent on this computer (Claude Code, Claude Desktop
// and others) finds scripture, builds plans and runs the screen. Off until it is turned
// on in Settings > Connection, on this computer only, and behind a token.

import { app, nativeImage } from "electron"
import { constants as fsConstants, createWriteStream } from "fs"
import { access, copyFile, unlink } from "fs/promises"
import http from "http"
import path from "path"
import { Readable, Transform } from "stream"
import { pipeline } from "stream/promises"
import { ToMain } from "../../types/IPC/ToMain"
import { requestToMain } from "../IPC/main"
import { OutputHelper } from "../output/OutputHelper"
import { getDataFolderPath } from "../utils/files"
import { wait } from "../utils/helpers"
import { handleMcpMessage, refuseRequest, type McpApp, type McpContent, type McpTool } from "./mcpProtocol"

export const AGENT_PORT = 5507
const MAX_BODY = 2 * 1024 * 1024
const MAX_MEDIA = 500 * 1024 * 1024
const CALL_TIMEOUT = 40_000
const IMAGE_WIDTH = 960
const MEDIA_TYPES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm", ".m4v", ".mp3", ".m4a", ".wav", ".pdf", ".ppt", ".pptx"])
// what a web address may answer with; some file hosts only say "a file"
const MEDIA_ANSWERS = /^(image\/|video\/|audio\/|application\/(pdf|octet-stream|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml))/i

let server: http.Server | null = null
let token = ""

const words = (value: unknown): McpContent => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) })
const failed = (message: string) => ({ content: [words(message)], isError: true })

const ownTools: McpTool[] = [
    {
        name: "get_screen_image",
        description: "A picture of what a screen shows right now.",
        inputSchema: { type: "object", properties: {} },
        readOnly: true
    },
    {
        name: "add_media",
        // a file of the same name in the media folder is replaced
        destructive: true,
        description: "Add a picture, video, sound, PDF or slide deck to the media folder, from a web address or a file on this computer. A file on this computer can be shown now if asked; one from the web is only saved.",
        inputSchema: {
            type: "object",
            properties: { source: { type: "string", description: "https address or full file path" }, name: { type: "string", description: "File name to save it as" }, show: { type: "boolean" } },
            required: ["source"]
        }
    }
]

async function runInApp(name: string, args: any): Promise<{ ok: boolean; result?: any; error?: string }> {
    const answer = (await requestToMain(ToMain.AGENT, { method: "call", name, args }, undefined, CALL_TIMEOUT)) as any
    return answer || { ok: false, error: "The app is not ready yet. Try again in a few seconds." }
}

async function screenImage() {
    const state = await runInApp("get_live_state", {})
    if (!state.ok) return failed(state.error || "The app is not ready yet.")
    const window = OutputHelper.renderWindow(OutputHelper.getOutput(state.result.outputId))
    if (!window) return failed(`The screen's window is not open, so there is no picture. get_live_state says what it would show: ${JSON.stringify(state.result.showing)}`)
    // the change just made may still be fading in, and the first capture of a hidden window is its last frame
    await wait(700)
    await window.webContents.capturePage()
    const image = await window.webContents.capturePage()
    if (image.isEmpty()) return failed(`The screen could not be captured. It shows: ${JSON.stringify(state.result.showing)}`)
    const small = image.getSize().width > IMAGE_WIDTH ? nativeImage.createFromBuffer(image.toPNG()).resize({ width: IMAGE_WIDTH }) : image
    return { content: [{ type: "image" as const, data: small.toJPEG(82).toString("base64"), mimeType: "image/jpeg" }, words(state.result.showing || "Nothing on screen.")] }
}

// "Sunrise.jpg" taken: "Sunrise 2.jpg"
async function freePath(file: string) {
    const { dir, name, ext } = path.parse(file)
    for (let n = 1; ; n++) {
        const candidate = path.join(dir, n === 1 ? `${name}${ext}` : `${name} ${n}${ext}`)
        try {
            await access(candidate)
        } catch {
            return candidate
        }
    }
}

/** saves a file from the web or this computer into the media folder; reuse: the one already there by that name */
export async function saveMedia(args: { source?: unknown; name?: unknown; reuse?: boolean }, { redirect = "follow" as RequestRedirect } = {}): Promise<{ path?: string; error?: string }> {
    const failed = (error: string) => ({ error })
    const source = typeof args?.source === "string" ? args.source.trim() : ""
    const remote = /^https:\/\//i.test(source)
    if (!source || (!remote && !path.isAbsolute(source))) return failed("Give an https address or a full file path.")

    // a name never leaves the media folder and never replaces a file
    const original = path.basename(remote ? decodeURIComponent(new URL(source).pathname) : source)
    let fileName = path.basename(typeof args.name === "string" && args.name.trim() ? args.name : original).replace(/[^\p{L}\p{N}_.\- ]+/gu, "_")
    if (!MEDIA_TYPES.has(path.extname(fileName).toLowerCase())) fileName += path.extname(original)
    const type = path.extname(fileName).toLowerCase()
    if (!MEDIA_TYPES.has(type) || (!remote && path.extname(source).toLowerCase() !== type)) return failed("Only pictures, videos, sounds, PDFs and slide decks can be added.")

    const wanted = path.join(getDataFolderPath("media"), fileName)
    const target = await freePath(wanted)
    if (args.reuse && target !== wanted) return { path: wanted }
    if (remote) {
        const response = await fetch(source, { redirect, signal: AbortSignal.timeout(5 * 60_000) }).catch(() => null)
        if (!response) return failed("Could not download it. Give the address of the file itself.")
        if (!response.ok || !response.body) return failed(`Could not download it (${response.status}).`)
        if (!MEDIA_ANSWERS.test(response.headers.get("content-type") || "")) {
            await response.body.cancel().catch(() => undefined)
            return failed("That address did not send a picture, video, sound, PDF or slide deck.")
        }
        // the size a server claims is not the size it sends
        let received = 0
        const limit = new Transform({
            transform(chunk, _encoding, done) {
                received += chunk.length
                done(received > MAX_MEDIA ? new Error("too big") : null, chunk)
            }
        })
        try {
            await pipeline(Readable.fromWeb(response.body as any), limit, createWriteStream(target))
        } catch {
            await unlink(target).catch(() => undefined)
            return failed(received > MAX_MEDIA ? "That file is over 500 MB." : "The download was cut off.")
        }
    } else {
        await copyFile(source, target, fsConstants.COPYFILE_EXCL)
    }
    return { path: target }
}

async function addMedia(args: any) {
    // an agent's address is used as given: a redirect could lead anywhere
    const { path: target, error } = await saveMedia({ source: args?.source, name: args?.name }, { redirect: "error" })
    if (!target) return failed(error || "That could not be saved.")

    // words the model read can ask for this: nothing from the web goes on screen unseen
    if (args.show === true && /^\s*https:/i.test(args.source)) return { content: [words({ saved: target, shown: false, note: "Saved but not shown: a file from the web is shown by the operator, in the media drawer." })] }
    if (args.show === true) {
        const shown = await runInApp("show_media", { path: target })
        if (!shown.ok) return failed(`Saved to ${target}, but not shown: ${shown.error}`)
    }
    return { content: [words({ saved: target, shown: args.show === true })] }
}

export const mcpApp: McpApp = {
    version: app?.getVersion?.() || "",
    async tools() {
        const list = (await requestToMain(ToMain.AGENT, { method: "list" })) as any
        return [...(Array.isArray(list) ? list : []), ...ownTools]
    },
    async call(name, args) {
        if (name === "get_screen_image") return screenImage()
        if (name === "add_media") return addMedia(args)
        // used by this server, not offered to agents
        if (name === "show_media") return failed('There is no tool called "show_media".')
        const { ok, result, error } = await runInApp(name, args)
        return ok ? { content: [words(result)] } : failed(error || "That did not work in the app.")
    }
}

function send(res: http.ServerResponse, status: number, body?: any): void {
    if (body === undefined) res.writeHead(status).end()
    else res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage): Promise<string | null> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY) return null
        chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString("utf8")
}

async function receive(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const refused = refuseRequest(req.headers, AGENT_PORT, token)
    if (refused) return send(res, refused.status, { error: refused.message })
    if ((req.url || "").split("?")[0] !== "/mcp") return send(res, 404, { error: "The address is /mcp." })
    // no server-sent stream and no sessions: each request is answered on its own
    if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" }).end()
        return
    }

    const body = await readBody(req)
    if (body === null) return send(res, 413, { error: "Too big." })
    let message: any
    try {
        message = JSON.parse(body)
    } catch {
        return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON." } })
    }

    const reply = await answerMessages(message, mcpApp)
    if (Array.isArray(reply) ? reply.length : reply) send(res, 200, reply)
    else send(res, 202)
}

/** one message, or a batch: its calls change the screen and the library, so they run one at a time */
export async function answerMessages(message: any, app: McpApp): Promise<any> {
    if (!Array.isArray(message)) return handleMcpMessage(message, app)
    const replies: any[] = []
    for (const part of message.slice(0, 20)) {
        const reply = await handleMcpMessage(part, app)
        if (reply) replies.push(reply)
    }
    return replies
}

/** answers true when the server is doing what was asked */
export async function setAgentServer(options: { enabled: boolean; token?: string }): Promise<boolean> {
    if (server) {
        const closing = server
        server = null
        closing.closeAllConnections?.()
        await new Promise((resolve) => closing.close(resolve))
    }

    token = (options.token || "").trim()
    if (!options.enabled) return true
    if (!token) return false

    const next = http.createServer((req, res) => {
        receive(req, res).catch((err) => {
            console.error("Agent server:", err)
            if (!res.headersSent) send(res, 500, { error: "That did not work in the app." })
        })
    })
    return new Promise((resolve) => {
        next.once("error", (err) => {
            console.error("Agent server could not start:", err)
            resolve(false)
        })
        next.listen(AGENT_PORT, "127.0.0.1", () => {
            server = next
            console.info(`Agent server on 127.0.0.1:${AGENT_PORT}`)
            resolve(true)
        })
    })
}
