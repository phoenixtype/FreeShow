// Deletes a church for good, or the caller's whole account.
// POST { scope: "church", churchId, confirmName }  owner only; confirmName must be the church's name
// POST { scope: "account" }                         the signed-in account and every church only they are in
// A church goes in this order: its Stripe subscription is cancelled, its media files are removed, then the
// church and everything in it. If Stripe cannot be reached nothing is deleted, so nobody pays for a church that is gone.
import Stripe from "npm:stripe@23"
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

type Db = ReturnType<typeof admin>

class Refused extends Error {
    constructor(
        public status: number,
        public code: string,
        public text: string
    ) {
        super(code)
    }
}

const BILLING_DOWN = "The plan could not be cancelled right now, so nothing was deleted. Try again later."

async function cancelSubscription(db: Db, churchId: string) {
    const { data, error } = await db.from("church_subscriptions").select("stripe_subscription_id").eq("church_id", churchId).maybeSingle()
    if (error) throw error
    if (!data?.stripe_subscription_id) return
    const key = Deno.env.get("STRIPE_SECRET_KEY")
    if (!key) throw new Refused(503, "billing_unavailable", BILLING_DOWN)
    const stripe = new Stripe(key)
    try {
        const subscription = await stripe.subscriptions.retrieve(data.stripe_subscription_id)
        if (subscription.status !== "canceled") await stripe.subscriptions.cancel(data.stripe_subscription_id)
    } catch (err) {
        // already gone at Stripe: nothing left to stop
        if ((err as { code?: string })?.code !== "resource_missing") throw new Refused(502, "billing_unavailable", BILLING_DOWN)
    }
}

/** Every file under <churchId>/ in the media bucket. */
async function removeMedia(db: Db, churchId: string) {
    const bucket = db.storage.from("church-media")
    const files: string[] = []
    const folders = [churchId]
    while (folders.length) {
        const folder = folders.pop()!
        for (let offset = 0; ; offset += 100) {
            const { data, error } = await bucket.list(folder, { limit: 100, offset })
            if (error) throw error
            for (const item of data || []) {
                // a folder has no id
                if (item.id) files.push(`${folder}/${item.name}`)
                else folders.push(`${folder}/${item.name}`)
            }
            if (!data || data.length < 100) break
        }
    }
    for (let i = 0; i < files.length; i += 100) {
        const { error } = await bucket.remove(files.slice(i, i + 100))
        if (error) throw error
    }
}

async function deleteChurch(db: Db, churchId: string) {
    await cancelSubscription(db, churchId)
    await removeMedia(db, churchId)
    const { error } = await db.from("churches").delete().eq("id", churchId)
    if (error) throw error
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const body = await req.json().catch(() => ({}))
        const db = admin()

        if (body.scope === "church") {
            const churchId = String(body.churchId || "")
            const caller = await callerRole(req, churchId)
            if (!caller) return json({ error: "unauthorized" }, 401)
            if (caller.role !== "owner") return json({ error: "forbidden", message: "Only the church's owner can delete it." }, 403)
            const { data: church, error } = await db.from("churches").select("name").eq("id", churchId).maybeSingle()
            if (error) throw error
            if (!church) return json({ error: "not_found", message: "That church is already gone." }, 404)
            if (
                String(body.confirmName || "")
                    .trim()
                    .toLowerCase() !== String(church.name).trim().toLowerCase()
            ) {
                return json({ error: "name_mismatch", message: "Type the church's name exactly to delete it." }, 400)
            }
            await deleteChurch(db, churchId)
            return json({ deleted: true })
        }

        if (body.scope === "account") {
            const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
            if (!token) return json({ error: "unauthorized" }, 401)
            const { data: user, error: userError } = await db.auth.getUser(token)
            if (userError || !user?.user) return json({ error: "unauthorized" }, 401)
            const userId = user.user.id

            const { data: owned, error } = await db.from("church_members").select("church_id, church:churches(name)").eq("user_id", userId).eq("role", "owner")
            if (error) throw error
            const alone: string[] = []
            const shared: string[] = []
            for (const row of owned || []) {
                const { count, error: countError } = await db.from("church_members").select("user_id", { count: "exact", head: true }).eq("church_id", row.church_id)
                if (countError) throw countError
                if (count === 1) alone.push(row.church_id)
                else shared.push((row.church as unknown as { name: string } | null)?.name || "your church")
            }
            // checked before anything is deleted: another person's library never goes with this account
            if (shared.length) return json({ error: "owns_shared_church", message: `Make someone else the owner of ${shared.join(", ")} first, or delete the church.` }, 409)
            for (const churchId of alone) await deleteChurch(db, churchId)
            const { error: deleteError } = await db.auth.admin.deleteUser(userId)
            if (deleteError) throw deleteError
            return json({ deleted: true })
        }

        return json({ error: "unknown_scope", message: "Choose church or account." }, 400)
    } catch (error) {
        if (error instanceof Refused) return json({ error: error.code, message: error.text }, error.status)
        return failure(error)
    }
})
