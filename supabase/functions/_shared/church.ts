// Shared by the church library's edge functions: CORS, JSON replies, and
// who is calling with which role in which church.
import { createClient } from "npm:@supabase/supabase-js@2"

export const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

/** A fixed error shape: never the internal message (it can carry table names). */
export function failure(error: unknown, requestId = crypto.randomUUID()) {
    console.error(requestId, error)
    return json({ error: "internal_error", message: "We couldn't finish that. Please try again.", requestId }, 500)
}

export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })

/** The signed-in caller and their role in the church, or null. */
export async function callerRole(req: Request, churchId: string): Promise<{ userId: string; email: string; role: string } | null> {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!token || !/^[0-9a-f-]{36}$/.test(churchId)) return null
    const db = admin()
    const { data: user, error } = await db.auth.getUser(token)
    if (error || !user?.user) return null
    const { data: member, error: memberError } = await db.from("church_members").select("role").eq("church_id", churchId).eq("user_id", user.user.id).maybeSingle()
    if (memberError || !member) return null
    return { userId: user.user.id, email: user.user.email || "", role: member.role }
}
