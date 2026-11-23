// Opens Stripe's billing portal for a church: change plan, card, invoices, cancel.
// POST { churchId }. Owners and admins only.
import Stripe from "npm:stripe@23"
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const { churchId } = await req.json().catch(() => ({}))
        const caller = await callerRole(req, String(churchId || ""))
        if (!caller) return json({ error: "unauthorized" }, 401)
        if (!["owner", "admin"].includes(caller.role)) return json({ error: "forbidden" }, 403)

        const key = Deno.env.get("STRIPE_SECRET_KEY")
        if (!key) return json({ error: "billing_unavailable" }, 503)
        const { data, error } = await admin().from("church_subscriptions").select("stripe_customer_id").eq("church_id", churchId).maybeSingle()
        if (error) throw error
        if (!data?.stripe_customer_id) return json({ error: "no_subscription", message: "This church has no paid plan yet." }, 404)

        const session = await new Stripe(key).billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: "https://project.scriptural.online" })
        return json({ url: session.url })
    } catch (error) {
        return failure(error)
    }
})
