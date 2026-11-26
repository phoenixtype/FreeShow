import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => ({ calls: [] as { path: string; init: any }[], answer: (_path: string): any => [], invoked: [] as { name: string; body: any }[], reply: { ok: true, status: 200, data: {} as any } }))
vi.mock("./connection", () => {
    class ScripturalError extends Error {}
    const rest = async (path: string, init: any = {}) => {
        server.calls.push({ path, init })
        return { data: server.answer(path) }
    }
    const invoke = async (name: string, body: any) => {
        server.invoked.push({ name, body })
        return server.reply
    }
    return { ScripturalError, churchLibrary: { getSession: () => ({ access_token: "a.e30.b" }), rest, invoke } }
})

import { deleteAccount, deleteChurch, exportSongs, isLive, PLANS, planState, priceId, rolesICanGive } from "./churchAccount"

describe("the church's plan", () => {
    const limits = { plan: "church", max_members: 10, max_songs: null }

    it("says when a payment failed", () => {
        expect(planState(limits, { status: "past_due", stripe_subscription_id: "sub_1" }).paymentFailed).toBe(true)
        expect(planState({ ...limits, plan: "free" }, { status: "unpaid", stripe_subscription_id: "sub_1" }).paymentFailed).toBe(true)
        expect(planState(limits, { status: "active", stripe_subscription_id: "sub_1" }).paymentFailed).toBe(false)
    })
    it("offers no billing page for a plan given by hand", () => {
        const given = planState(limits, { status: "active", stripe_subscription_id: null })
        expect([given.comped, given.canManageBilling]).toEqual([true, false])
        expect(planState(limits, { status: "active", stripe_subscription_id: "sub_1" }).canManageBilling).toBe(true)
        expect(planState({ ...limits, plan: "free" }, null).canManageBilling).toBe(false)
    })
    it("can buy both paid plans, monthly or yearly", () => {
        expect(PLANS.map((p) => [p.monthly, p.yearly])).toEqual([
            [19, 190],
            [49, 490]
        ])
        expect(priceId("church", false)).toBe("church_monthly")
        expect(priceId("multi_campus", true)).toBe("multi_campus_yearly")
    })
})

describe("people", () => {
    it("lets only the owner make admins, and nobody make an owner", () => {
        expect(rolesICanGive("owner")).toEqual(["admin", "editor", "viewer"])
        expect(rolesICanGive("admin")).toEqual(["editor", "viewer"])
        expect(rolesICanGive("editor")).toEqual([])
    })
})

describe("during a meeting", () => {
    it("counts as live while any screen shows something", () => {
        expect(isLive({ a: { out: { slide: null } } })).toBe(false)
        expect(isLive({ a: { out: {} }, b: { out: { slide: { id: "s" } } } })).toBe(true)
    })
})

describe("deleting and exporting", () => {
    beforeEach(() => {
        server.calls.length = 0
        server.invoked.length = 0
        server.reply = { ok: true, status: 200, data: { deleted: true } }
    })

    it("asks the server to delete the church by its typed name", async () => {
        await deleteChurch("c1", "Grace Church")
        expect(server.invoked[0]).toEqual({ name: "church-delete", body: { scope: "church", churchId: "c1", confirmName: "Grace Church" } })
    })
    it("shows the server's reason when the account cannot be deleted", async () => {
        server.reply = { ok: false, status: 409, data: { message: "Make someone else the owner of Grace first." } }
        await expect(deleteAccount()).rejects.toThrow("Make someone else the owner of Grace first.")
    })
    it("exports every song, a page at a time", async () => {
        const page = Array.from({ length: 1000 }, (_, i) => ({ id: String(i).padStart(4, "0"), title: "Song" }))
        server.answer = (path) => (path.includes("id=gt.0999") ? [{ id: "1000", title: "Last" }] : page)
        const file = JSON.parse(await exportSongs("c1", "Grace Church"))
        expect(file.church).toBe("Grace Church")
        expect(file.songs).toHaveLength(1001)
        expect(server.calls[0].path).toContain("deleted_at=is.null")
    })
})
