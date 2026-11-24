// Continue with Google. The account is chosen in the person's own browser, never in a
// window of this app, and the answer comes back to this computer only: the browser is
// sent to a one-time address on 127.0.0.1, with a code that is worth nothing without the
// verifier kept here (PKCE).

import { shell } from "electron"
import { createHash, randomBytes } from "crypto"
import http from "http"

const LANDING = "https://project.scriptural.online/signed-in/"
const WAIT_MS = 5 * 60 * 1000
const PROJECT = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/

export interface BrowserSignIn {
    code?: string
    verifier?: string
    error?: "cancelled" | "failed"
}

const random = () => randomBytes(32).toString("base64url")

let cancelWaiting: (() => void) | null = null

export function cancelBrowserSignIn() {
    cancelWaiting?.()
}

export function browserSignIn({ projectUrl }: { projectUrl: string }, open: (url: string) => Promise<void> = (url) => shell.openExternal(url)): Promise<BrowserSignIn> {
    // a second press starts over; the first one's browser tab leads nowhere
    cancelWaiting?.()
    if (!PROJECT.test(projectUrl)) return Promise.resolve({ error: "failed" })

    const verifier = random()
    const key = random()

    return new Promise((resolve) => {
        const finish = (answer: BrowserSignIn) => {
            clearTimeout(timeout)
            if (cancelWaiting === cancel) cancelWaiting = null
            server.close()
            resolve(answer)
        }
        const cancel = () => finish({ error: "cancelled" })
        const timeout = setTimeout(cancel, WAIT_MS)

        const server = http.createServer((request, response) => {
            const url = new URL(request.url || "/", "http://127.0.0.1")
            if (request.method !== "GET" || url.pathname !== `/${key}`) {
                response.writeHead(404).end()
                return
            }
            const code = url.searchParams.get("code") || ""
            response.writeHead(302, { Location: `${LANDING}?done=${code ? 1 : 0}`, Connection: "close" }).end()
            finish(code ? { code, verifier } : { error: "cancelled" })
        })
        server.on("error", () => finish({ error: "failed" }))
        cancelWaiting = cancel

        server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            if (!address || typeof address === "string") return finish({ error: "failed" })
            const authorize = new URL(`${projectUrl}/auth/v1/authorize`)
            authorize.search = new URLSearchParams({
                provider: "google",
                redirect_to: `${LANDING}?port=${address.port}&key=${key}`,
                code_challenge: createHash("sha256").update(verifier).digest("base64url"),
                code_challenge_method: "s256"
            }).toString()
            open(authorize.toString()).catch(() => finish({ error: "failed" }))
        })
    })
}
