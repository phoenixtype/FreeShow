// The one place this app talks to Scriptural (scriptural.online): its public
// endpoints, and a signed-in session for what an account unlocks.
//
// Sign-in is by a code emailed to an existing Scriptural account; nothing here
// creates accounts. The session is kept on this computer only and refreshed
// when it expires. What an account may read is decided by Scriptural's
// database (row-level security), never by this app.

const PROJECT_URL = "https://sdtusilsfchpryrbmplq.supabase.co"
// The public (anon) key of the Scriptural project; it ships in every Scriptural client.
export const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVzaWxzZmNocHJ5cmJtcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjU4NzcsImV4cCI6MjA3MTc0MTg3N30.tWnGvQlE2J-1bTmc_u3JDRyIQYJ7vR7jekk6oVtU4QM"

export const FUNCTIONS_URL = `${PROJECT_URL}/functions/v1`
const REST_URL = `${PROJECT_URL}/rest/v1`
const AUTH_URL = `${PROJECT_URL}/auth/v1`

const SESSION_KEY = "scriptural-session"

export interface ScripturalSession {
    access_token: string
    refresh_token: string
    expires_at: number // seconds since epoch
    email: string
}

export class ScripturalError extends Error {}

export function getSession(): ScripturalSession | null {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
    } catch {
        return null
    }
}

function storeSession(session: ScripturalSession | null) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
}

async function authRequest(path: string, body: object): Promise<any> {
    const response = await fetch(`${AUTH_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new ScripturalError(data?.msg || data?.error_description || data?.message || "Scriptural could not be reached. Try again.")
    return data
}

function toSession(data: any, email: string): ScripturalSession {
    return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600), email }
}

/** Emails a sign-in code. Only an existing Scriptural account receives one. */
export async function sendSignInCode(email: string) {
    await authRequest("/otp", { email: email.trim(), create_user: false })
}

export async function verifySignInCode(email: string, code: string): Promise<ScripturalSession> {
    const data = await authRequest("/verify", { type: "email", email: email.trim(), token: code.trim() })
    const session = toSession(data, email.trim())
    storeSession(session)
    return session
}

export async function signOut() {
    const session = getSession()
    storeSession(null)
    if (!session) return
    // best effort: the local session is already gone either way
    await fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
}

/** A current access token, refreshed when within a minute of expiring; null when signed out. */
async function accessToken(): Promise<string | null> {
    const session = getSession()
    if (!session) return null
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token

    try {
        const data = await authRequest("/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        const refreshed = toSession(data, session.email)
        storeSession(refreshed)
        return refreshed.access_token
    } catch {
        storeSession(null)
        return null
    }
}

/** GET from Scriptural's REST API as the signed-in account (or anonymously). Throws on any failure. */
export async function restGet<T>(pathAndQuery: string, headers: Record<string, string> = {}): Promise<{ data: T; response: Response }> {
    const token = (await accessToken()) || ANON_KEY
    const response = await fetch(`${REST_URL}/${pathAndQuery}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, ...headers } })
    if (!response.ok) throw new ScripturalError(`Scriptural answered ${response.status}`)
    return { data: (await response.json()) as T, response }
}
