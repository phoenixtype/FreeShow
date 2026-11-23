// A licensed Bible version for a church that may have it: on a paid plan and
// granted by Samuel (bible_access_requests). Public-domain versions are read
// straight from Scriptural by the app and never come through here.
// POST { churchId, version } -> { rows: [{ book, chapter, verse, text }] }
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

const PAGE = 1000

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const { churchId, version } = await req.json().catch(() => ({}))
        if (typeof version !== "string" || !/^[A-Z0-9]{2,10}$/.test(version)) return json({ error: "bad_request" }, 400)
        const caller = await callerRole(req, String(churchId || ""))
        if (!caller) return json({ error: "unauthorized" }, 401)

        const db = admin()
        const [{ data: limits, error: limitsError }, { data: grant, error: grantError }] = await Promise.all([db.rpc("church_limits", { target: churchId }).single(), db.from("bible_access_requests").select("status").eq("church_id", churchId).eq("version", version).maybeSingle()])
        if (limitsError) throw limitsError
        if (grantError) throw grantError
        if ((limits as { plan: string }).plan === "free") return json({ error: "plan_required", message: "Licensed versions come with a Church plan." }, 402)
        if (grant?.status !== "granted") return json({ error: "not_granted", message: "Access to this version has not been granted yet." }, 403)

        const scripturalUrl = Deno.env.get("SCRIPTURAL_URL")
        const scripturalKey = Deno.env.get("SCRIPTURAL_SERVICE_ROLE_KEY")
        if (!scripturalUrl || !scripturalKey) return json({ error: "unavailable", message: "Licensed versions are not available yet." }, 503)

        const rows: unknown[] = []
        for (let offset = 0; ; offset += PAGE) {
            const response = await fetch(`${scripturalUrl}/rest/v1/bible_verses?select=book,chapter,verse,text&version=eq.${version}&order=book.asc,chapter.asc,verse.asc&offset=${offset}&limit=${PAGE}`, {
                headers: { apikey: scripturalKey, Authorization: `Bearer ${scripturalKey}` }
            })
            if (!response.ok) throw new Error(`Scriptural answered ${response.status}`)
            const page = await response.json()
            rows.push(...page)
            if (page.length < PAGE) break
        }
        return json({ rows })
    } catch (error) {
        return failure(error)
    }
})
