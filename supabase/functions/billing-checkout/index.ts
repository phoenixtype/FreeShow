// Starts a Stripe Checkout for a church's plan. Owners and admins only.
// POST { churchId, price: "church_monthly" | "church_yearly" | "multi_campus_monthly" | "multi_campus_yearly" }
import Stripe from "npm:stripe@23"
import { isLive } from "../_shared/billing.ts"
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

const PRICES = new Set(["church_monthly", "church_yearly", "multi_campus_monthly", "multi_campus_yearly"])
const SITE = "https://project.scriptural.online"
const SUBSCRIBED = { error: "already_subscribed", message: "This church already has a plan. Use Manage billing to change it." }

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
        if (existing && existing.plan !== "free" && isLive(existing.status)) return json(SUBSCRIBED, 409)

        // our record only changes when the webhook lands: ask Stripe too. The id is a uuid (callerRole checked it).
        const found = await stripe.subscriptions.search({ query: `metadata['church_id']:'${churchId}' AND metadata['app']:'scriptural-project'`, limit: 20 })
        if (found.data.some((sub) => isLive(sub.status))) return json(SUBSCRIBED, 409)

        // one checkout page at a time: close the last one before opening another
        const { data: open, error: openError } = await db.from("church_checkouts").select("session_id").eq("church_id", churchId).maybeSingle()
        if (openError) throw openError
        if (open) {
            const last = await stripe.checkout.sessions.retrieve(open.session_id)
            // just paid there, and neither search nor the webhook has caught up
            if (last.status === "complete" && last.subscription) {
                const paid = await stripe.subscriptions.retrieve(typeof last.subscription === "string" ? last.subscription : last.subscription.id)
                if (isLive(paid.status)) return json(SUBSCRIBED, 409)
            }
            if (last.status === "open") await stripe.checkout.sessions.expire(last.id)
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
            // the thank-you page counts the sale from these
            success_url: `${SITE}/thanks/?price=${price}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${SITE}/pricing`
        })
        const { error: keepError } = await db.from("church_checkouts").upsert({ church_id: churchId, session_id: session.id, created_at: new Date().toISOString() })
        if (keepError) throw keepError
        return json({ url: session.url })
    } catch (error) {
        return failure(error)
    }
})
