// How this app talks to its two backends: Scriptural (scriptural.online), for
// scripture search and Bible text, and the church library, where a church
// keeps its songs, media and plans. Both are Supabase projects reached with
// their public (anon) keys, which ship in every client.
//
// Sign-in is with Google, in the browser, or by a code emailed to the account. The session is kept on this
// computer only and refreshed when it expires. What an account may read or
// change is decided by each database (row-level security), never by this app.

import { Main } from "../../types/IPC/Main"

// a little longer than the app waits for the browser
const GOOGLE_WAIT_MS = 5 * 60 * 1000 + 5000

const SCRIPTURAL_URL = "https://sdtusilsfchpryrbmplq.supabase.co"
export const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVzaWxzZmNocHJ5cmJtcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjU4NzcsImV4cCI6MjA3MTc0MTg3N30.tWnGvQlE2J-1bTmc_u3JDRyIQYJ7vR7jekk6oVtU4QM"
export const FUNCTIONS_URL = `${SCRIPTURAL_URL}/functions/v1`

const CHURCH_URL = "https://gsrpimdgxepoydbrdlqx.supabase.co"
const CHURCH_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcnBpbWRneGVwb3lkYnJkbHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTQxNzIsImV4cCI6MjEwNDAzMDE3Mn0.SFxJPiJaVUx9hM0BEx8BC6tKUbvAymtNTljN2bcvmTw"

interface ScripturalSession {
    access_token: string
    refresh_token: string
    expires_at: number // seconds since epoch
    email: string
}

export class ScripturalError extends Error {}
// the auth server answered and said no (as opposed to not being reached)
class AuthRejected extends ScripturalError {
    constructor(
        message: string,
        public status: number
    ) {
        super(message)
    }
}

function makeConnection(projectUrl: string, anonKey: string, sessionKey: string, createUsers: boolean) {
    const REST_URL = `${projectUrl}/rest/v1`
    const AUTH_URL = `${projectUrl}/auth/v1`

    function getSession(): ScripturalSession | null {
        try {
            return JSON.parse(localStorage.getItem(sessionKey) || "null")
        } catch {
            return null
        }
    }

    function storeSession(session: ScripturalSession | null) {
        if (session) localStorage.setItem(sessionKey, JSON.stringify(session))
        else localStorage.removeItem(sessionKey)
    }

    async function authRequest(path: string, body: object): Promise<any> {
        const response = await fetch(`${AUTH_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: anonKey }, body: JSON.stringify(body) })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new AuthRejected(data?.msg || data?.error_description || data?.message || "Could not be reached. Try again.", response.status)
        return data
    }

    const toSession = (data: any, email: string): ScripturalSession => ({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600), email })

    /** Emails a sign-in code. */
    async function sendSignInCode(email: string) {
        await authRequest("/otp", { email: email.trim(), create_user: createUsers })
    }

    async function verifySignInCode(email: string, code: string): Promise<ScripturalSession> {
        const session = toSession(await authRequest("/verify", { type: "email", email: email.trim(), token: code.trim() }), email.trim())
        storeSession(session)
        return session
    }

    /** Opens Google's sign-in in the browser; null when the person backs out. */
    async function signInWithGoogle(): Promise<ScripturalSession | null> {
        // only here: the rest of this file runs without the app around it
        const { requestMain } = await import("../IPC/main")
        const answer = await requestMain(Main.BROWSER_SIGN_IN, { projectUrl }, undefined, GOOGLE_WAIT_MS)
        if (answer?.error === "cancelled") return null
        if (!answer?.code || !answer.verifier) throw new ScripturalError("The browser could not be opened. Sign in with your email instead.")
        const data = await authRequest("/token?grant_type=pkce", { auth_code: answer.code, code_verifier: answer.verifier })
        const session = toSession(data, data.user?.email || "")
        storeSession(session)
        return session
    }

    async function signOut() {
        const session = getSession()
        storeSession(null)
        if (!session) return
        // best effort: the local session is already gone either way
        await fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
    }

    /** A current access token, refreshed when within a minute of expiring; null when signed out. */
    async function accessToken(): Promise<string | null> {
        const session = getSession()
        if (!session) return null
        if (session.expires_at - 60 > Date.now() / 1000) return session.access_token
        try {
            const refreshed = toSession(await authRequest("/token?grant_type=refresh_token", { refresh_token: session.refresh_token }), session.email)
            storeSession(refreshed)
            return refreshed.access_token
        } catch (err) {
            // only a refused refresh token ends the session; offline in the meeting room, it is kept
            if (err instanceof AuthRejected && err.status >= 400 && err.status < 500) {
                storeSession(null)
                return null
            }
            throw new ScripturalError("Could not reach the church library. Check the connection and try again.")
        }
    }

    /** A REST call as the signed-in account (or anonymously, unless signedIn). Throws on any failure. */
    async function rest<T>(pathAndQuery: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; signedIn?: boolean } = {}): Promise<{ data: T; response: Response }> {
        const userToken = await accessToken()
        // anonymous, row-level security turns a write into a silent no-op
        if (!userToken && init.signedIn) throw new ScripturalError("Your sign-in has ended. Sign in to the church library again.")
        const token = userToken || anonKey
        const response = await fetch(`${REST_URL}/${pathAndQuery}`, {
            method: init.method || "GET",
            headers: { apikey: anonKey, Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined
        })
        if (!response.ok) {
            const detail = await response.json().catch(() => null)
            throw new ScripturalError(detail?.message || `The server answered ${response.status}`)
        }
        const text = await response.text()
        return { data: (text ? JSON.parse(text) : null) as T, response }
    }

    /** Calls one of the project's edge functions as the signed-in account. Answers with its JSON, errors included. */
    async function invoke<T>(name: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
        const token = (await accessToken()) || anonKey
        const response = await fetch(`${projectUrl}/functions/v1/${name}`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
        return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T }
    }

    return { getSession, sendSignInCode, verifySignInCode, signInWithGoogle, signOut, rest, invoke }
}

/** Scriptural: read anonymously (public-domain text, search). */
const scriptural = makeConnection(SCRIPTURAL_URL, ANON_KEY, "scriptural-session", false)
/** The church library: a church's people sign up here. */
export const churchLibrary = makeConnection(CHURCH_URL, CHURCH_ANON_KEY, "church-library-session", true)

export const restGet = <T>(pathAndQuery: string, headers: Record<string, string> = {}) => scriptural.rest<T>(pathAndQuery, { headers })
