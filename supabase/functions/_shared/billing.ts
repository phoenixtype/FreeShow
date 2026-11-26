// A church has one subscription. The decisions that keep it that way.

/** still billing the church */
export const isLive = (status: string) => ["active", "trialing", "past_due"].includes(status)

export interface Subscription {
    id: string
    status: string
    /** when Stripe made it, in seconds */
    created: number
}

/**
 * What the webhook does with the subscription it just heard about, given the one
 * the church has on record (both as Stripe reports them now).
 */
export function secondSubscription(incoming: Subscription, stored: Subscription | null): "write" | "ignore" | "cancel_incoming" | "cancel_stored" {
    if (!stored || stored.id === incoming.id || !isLive(stored.status)) return "write"
    if (!isLive(incoming.status)) return "ignore"
    // paid twice: the later one goes
    return incoming.created >= stored.created ? "cancel_incoming" : "cancel_stored"
}
