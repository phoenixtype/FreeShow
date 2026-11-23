// Starts a Stripe Checkout for a church's plan. Owners and admins only.
// POST { churchId, price: "church_monthly" | "church_yearly" | "multi_campus_monthly" | "multi_campus_yearly" }
import Stripe from "npm:stripe@23"
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

const PRICES = new Set(["church_monthly", "church_yearly", "multi_campus_monthly", "multi_campus_yearly"])
const SITE = "https://project.scriptural.online"

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const { churchId, price } = await req.json().catch(() => ({}))
        if (!PRICES.has(price)) return json({ error: "unknown_price" }, 400)
        const caller = await callerRole(req, String(churchId || ""))
        if (!caller) return json({ error: "unauthorized" }, 401)
        if (!["owner", "admin"].includes(caller.role)) return json({ error: "forbidden", message: "Only the church's owner or an admin can change the plan." }, 403)

        const key = Deno.env.get("STRIPE_SECRET_KEY")
        if (!key) return json({ error: "billing_unavailable", message: "Plans are not on sale yet." }, 503)
        const stripe = new Stripe(key)

        const lookupKey = `scriptural_project_${price}`
        const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
        if (!prices.data[0]) return json({ error: "billing_unavailable", message: "Plans are not on sale yet." }, 503)

        const db = admin()
        const { data: existing, error } = await db.from("church_subscriptions").select("stripe_customer_id, plan, status").eq("church_id", churchId).maybeSingle()
        if (error) throw error
        // a second checkout would bill the church twice: changes go through the billing portal
        if (existing && existing.plan !== "free" && ["active", "trialing", "past_due"].includes(existing.status)) {
            return json({ error: "already_subscribed", message: "This church already has a plan. Use Manage billing to change it." }, 409)
        }

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: prices.data[0].id, quantity: 1 }],
            // reuse the church's customer only when we created it; otherwise Checkout asks for the email
            // automatic tax needs the customer's address: Checkout saves the one entered
            ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id, customer_update: { address: "auto", name: "auto" } } : { customer_email: caller.email }),
            client_reference_id: churchId,
            metadata: { app: "scriptural-project", church_id: churchId },
            subscription_data: { metadata: { app: "scriptural-project", church_id: churchId } },
            allow_promotion_codes: true,
            automatic_tax: { enabled: true },
            success_url: `${SITE}/thanks`,
            cancel_url: `${SITE}/pricing`
        })
        return json({ url: session.url })
    } catch (error) {
        return failure(error)
    }
})
