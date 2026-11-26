// deno test supabase/functions/_shared/billing.test.ts (no network)
import { isLive, secondSubscription } from "./billing.ts"

function equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`)
}

const first = { id: "sub_1", status: "active", created: 100 }

Deno.test("which statuses still bill the church", () => {
    for (const status of ["active", "trialing", "past_due"]) equal(isLive(status), true)
    for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]) equal(isLive(status), false)
})

Deno.test("a church's first subscription, or news of the same one, is written", () => {
    equal(secondSubscription(first, null), "write")
    equal(secondSubscription({ ...first, status: "canceled" }, first), "write")
    equal(secondSubscription({ id: "sub_2", status: "active", created: 200 }, { ...first, status: "canceled" }), "write")
})

Deno.test("two live subscriptions: the newer one is cancelled, whichever is heard of first", () => {
    equal(secondSubscription({ id: "sub_2", status: "active", created: 200 }, first), "cancel_incoming")
    equal(secondSubscription(first, { id: "sub_2", status: "active", created: 200 }), "cancel_stored")
})

Deno.test("a second one that is not live never replaces the live one", () => {
    equal(secondSubscription({ id: "sub_2", status: "canceled", created: 200 }, first), "ignore")
    equal(secondSubscription({ id: "sub_2", status: "incomplete", created: 200 }, first), "ignore")
})
