// How this app talks to its two backends: Scriptural (scriptural.online), for
// scripture search and Bible text, and the church library, where a church
// keeps its songs, media and plans. Both are Supabase projects reached with
// their public (anon) keys, which ship in every client.
//
// Sign-in is by a code emailed to the account. The session is kept on this
// computer only and refreshed when it expires. What an account may read or
// change is decided by each database (row-level security), never by this app.

const SCRIPTURAL_URL = "https://sdtusilsfchpryrbmplq.supabase.co"
export const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVzaWxzZmNocHJ5cmJtcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjU4NzcsImV4cCI6MjA3MTc0MTg3N30.tWnGvQlE2J-1bTmc_u3JDRyIQYJ7vR7jekk6oVtU4QM"
export const FUNCTIONS_URL = `${SCRIPTURAL_URL}/functions/v1`

const CHURCH_URL = "https://gsrpimdgxepoydbrdlqx.supabase.co"
const CHURCH_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcnBpbWRneGVwb3lkYnJkbHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTQxNzIsImV4cCI6MjEwNDAzMDE3Mn0.SFxJPiJaVUx9hM0BEx8BC6tKUbvAymtNTljN2bcvmTw"

export interface ScripturalSession {
    access_token: string
    refresh_token: string
    expires_at: number // seconds since epoch
    email: string
}

export class ScripturalError extends Error {}

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
        if (!response.ok) throw new ScripturalError(data?.msg || data?.error_description || data?.message || "Could not be reached. Try again.")
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
        } catch {
            storeSession(null)
            return null
        }
    }

    /** A REST call as the signed-in account (or anonymously). Throws on any failure. */
    async function rest<T>(pathAndQuery: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ data: T; response: Response }> {
        const token = (await accessToken()) || anonKey
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

    return { getSession, sendSignInCode, verifySignInCode, signOut, rest }
}

/** Scriptural: existing accounts only; nothing here creates one. */
export const scriptural = makeConnection(SCRIPTURAL_URL, ANON_KEY, "scriptural-session", false)
/** The church library: a church's people sign up here. */
export const churchLibrary = makeConnection(CHURCH_URL, CHURCH_ANON_KEY, "church-library-session", true)

export const { getSession, sendSignInCode, verifySignInCode, signOut } = scriptural
export const restGet = <T>(pathAndQuery: string, headers: Record<string, string> = {}) => scriptural.rest<T>(pathAndQuery, { headers })
