// Stripe -> church_subscriptions. Signed, and only for this product's
// subscriptions (metadata.app = scriptural-project). Stripe sends events out of
// order and retries them, so each one only says "look again": the subscription
// is read fresh from Stripe and written as it is now. Running an event twice is
// harmless; stripe_events records it once the write has landed.
import Stripe from "npm:stripe@23"
import { isLive, secondSubscription } from "../_shared/billing.ts"
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
        const { data: seen } = await db.from("stripe_events").select("id").eq("id", event.id).maybeSingle()
        if (seen) return json({ received: true, duplicate: true })

        if (event.type.startsWith("customer.subscription.")) {
            const snapshot = event.data.object as Stripe.Subscription
            const churchId = snapshot.metadata?.church_id
            if (snapshot.metadata?.app !== "scriptural-project" || !churchId) return json({ received: true, ignored: true })

            const sub = await stripe.subscriptions.retrieve(snapshot.id)
            const ended = ["canceled", "incomplete_expired", "unpaid"].includes(sub.status)

            // a church has one plan: a second subscription never replaces the live one
            const { data: stored, error: storedError } = await db.from("church_subscriptions").select("stripe_subscription_id, status").eq("church_id", churchId).maybeSingle()
            if (storedError) throw storedError
            let other: Stripe.Subscription | null = null
            if (stored?.stripe_subscription_id && stored.stripe_subscription_id !== sub.id && isLive(stored.status)) {
                // as Stripe has it now, not as we last wrote it
                other = await stripe.subscriptions.retrieve(stored.stripe_subscription_id).catch((error) => {
                    if (error?.code === "resource_missing") return null
                    throw error
                })
            }
            const outcome = secondSubscription(sub, other)
            if (outcome === "ignore" || outcome === "cancel_incoming") {
                if (outcome === "cancel_incoming") await cancelSecond(stripe, sub.id, churchId)
                await markSeen(db, event)
                return json({ received: true, ignored: true })
            }
            if (outcome === "cancel_stored") await cancelSecond(stripe, other!.id, churchId)

            const lookup = sub.items.data[0]?.price?.lookup_key || ""
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
        await markSeen(db, event)
        return json({ received: true })
    } catch (error) {
        // nothing recorded, so Stripe's retry is processed in full
        return failure(error)
    }
})

/** Paid twice: stop the second one billing. Its first payment is refunded by hand in Stripe. */
async function cancelSecond(stripe: Stripe, subscriptionId: string, churchId: string) {
    await stripe.subscriptions.cancel(subscriptionId)
    console.error(`Church ${churchId} had two subscriptions: cancelled ${subscriptionId}. Refund it in Stripe.`)
}

async function markSeen(db: ReturnType<typeof admin>, event: Stripe.Event) {
    const { error } = await db.from("stripe_events").insert({ id: event.id, type: event.type })
    if (error && error.code !== "23505") throw error
}
