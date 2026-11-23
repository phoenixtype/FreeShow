// Stripe -> church_subscriptions. Signed, idempotent per event id, and only
// for this product's subscriptions (metadata.app = scriptural-project).
import Stripe from "npm:stripe@23"
import { admin, failure, json } from "../_shared/church.ts"

const PLAN_BY_LOOKUP: Record<string, string> = {
    scriptural_project_church_monthly: "church",
    scriptural_project_church_yearly: "church",
    scriptural_project_multi_campus_monthly: "multi_campus",
    scriptural_project_multi_campus_yearly: "multi_campus"
}

Deno.serve(async (req) => {
    const key = Deno.env.get("STRIPE_SECRET_KEY")
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")
    if (!key || !secret) return json({ error: "not_configured" }, 503)
    const stripe = new Stripe(key)

    let event: Stripe.Event
    try {
        event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") || "", secret)
    } catch {
        return json({ error: "bad_signature" }, 400)
    }

    try {
        const db = admin()
        const { error: seenError } = await db.from("stripe_events").insert({ id: event.id, type: event.type })
        if (seenError?.code === "23505") return json({ received: true, duplicate: true })
        if (seenError) throw seenError

        if (event.type.startsWith("customer.subscription.")) {
            const sub = event.data.object as Stripe.Subscription
            const churchId = sub.metadata?.church_id
            if (sub.metadata?.app !== "scriptural-project" || !churchId) return json({ received: true, ignored: true })

            const lookup = sub.items.data[0]?.price?.lookup_key || ""
            const ended = event.type === "customer.subscription.deleted" || ["canceled", "incomplete_expired", "unpaid"].includes(sub.status)
            const { error } = await db.from("church_subscriptions").upsert({
                church_id: churchId,
                plan: ended ? "free" : PLAN_BY_LOOKUP[lookup] || "free",
                status: sub.status,
                stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
                stripe_subscription_id: sub.id,
                current_period_end: sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
            })
            if (error) throw error
        }
        return json({ received: true })
    } catch (error) {
        // let Stripe retry: forget the event so the retry is processed
        await admin().from("stripe_events").delete().eq("id", event.id)
        return failure(error)
    }
})
