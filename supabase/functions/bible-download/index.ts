// A licensed Bible version for a church that may have it: on a paid plan and
// granted by Samuel (bible_access_requests). Public-domain versions are read
// straight from Scriptural by the app and never come through here.
// POST { churchId, version, format?: "url" } -> { url } or { rows: [{ book, chapter, verse, text }] }
// The whole version is read from Scriptural once, kept in the private
// bible-cache bucket, and handed out as a short-lived link (format "url"; apps
// from before that get the rows). Five downloads per church per version per day.
// A corrected text: delete <VERSION>.json from the bucket.
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

const PAGE = 1000
const CACHE = "bible-cache"
const LINK_SECONDS = 600

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const { churchId, version, format } = await req.json().catch(() => ({}))
        if (typeof version !== "string" || !/^[A-Z0-9]{2,10}$/.test(version)) return json({ error: "bad_request" }, 400)
        const caller = await callerRole(req, String(churchId || ""))
        if (!caller) return json({ error: "unauthorized" }, 401)

        const db = admin()
        const [{ data: limits, error: limitsError }, { data: grant, error: grantError }] = await Promise.all([db.rpc("church_limits", { target: churchId }).single(), db.from("bible_access_requests").select("status").eq("church_id", churchId).eq("version", version).maybeSingle()])
        if (limitsError) throw limitsError
        if (grantError) throw grantError
        if ((limits as { plan: string }).plan === "free") return json({ error: "plan_required", message: "Licensed versions come with a Church plan." }, 402)
        if (grant?.status !== "granted") return json({ error: "not_granted", message: "Access to this version has not been granted yet." }, 403)

        const { data: allowed, error: countError } = await db.rpc("count_bible_download", { target: churchId, version_code: version })
        if (countError) throw countError
        if (!allowed) return json({ error: "too_many_downloads", message: "This version has been downloaded 5 times today. Try again tomorrow." }, 429)

        const cache = db.storage.from(CACHE)
        const file = `${version}.json`
        let { data: link } = await cache.createSignedUrl(file, LINK_SECONDS)
        if (!link) {
            const rows = await readVersion(version)
            if (!rows?.length) return json({ error: "unavailable", message: "Licensed versions are not available yet." }, 503)
            const { error: uploadError } = await cache.upload(file, new Blob([JSON.stringify({ rows })], { type: "application/json" }), { upsert: true, contentType: "application/json" })
            if (uploadError) throw uploadError
            const signed = await cache.createSignedUrl(file, LINK_SECONDS)
            if (signed.error) throw signed.error
            link = signed.data
        }
        if (format === "url") return json({ url: link!.signedUrl })

        const { data: kept, error: readError } = await cache.download(file)
        if (readError) throw readError
        return new Response(kept, { headers: { ...cors, "Content-Type": "application/json" } })
    } catch (error) {
        return failure(error)
    }
})

/** Every verse of a version, from Scriptural; null when that is not set up. */
async function readVersion(version: string): Promise<unknown[] | null> {
    const scripturalUrl = Deno.env.get("SCRIPTURAL_URL")
    const scripturalKey = Deno.env.get("SCRIPTURAL_SERVICE_ROLE_KEY")
    if (!scripturalUrl || !scripturalKey) return null

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
    return rows
}
