// A church's people, plan, export and deletion. Every call here comes from a
// button press in the church library window; the database and the edge
// functions check the caller's role again.

import { churchLibrary, ScripturalError } from "./connection"
import type { Church } from "./churchSync"

export type Role = Church["role"]
export interface Person {
    member_id: string
    /** owners and admins only; null for everyone else */
    member_email: string | null
    member_role: Role
    is_me: boolean
}
export interface Invite {
    id: string
    code: string
    role: Role
    expires_at: string
}

export const ROLE_NAMES: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" }

export const rolesICanGive = (mine: Role | undefined): Role[] => (mine === "owner" ? ["admin", "editor", "viewer"] : mine === "admin" ? ["editor", "viewer"] : [])

async function rpc<T>(name: string, body: object): Promise<T> {
    const { data } = await churchLibrary.rest<T>(`rpc/${name}`, { method: "POST", body, signedIn: true })
    return data
}

export const churchPeople = async (churchId: string) => (await rpc<Person[]>("church_people", { target: churchId })) || []
export const setMemberRole = (churchId: string, member: string, role: Role) => rpc("set_member_role", { target: churchId, member, new_role: role })
export const removeMember = (churchId: string, member: string) => rpc("remove_member", { target: churchId, member })
export const transferOwnership = (churchId: string, newOwner: string) => rpc("transfer_ownership", { target: churchId, new_owner: newOwner })

/** Invite codes not used and not expired. Owners and admins only. */
export async function openInvites(churchId: string): Promise<Invite[]> {
    const { data } = await churchLibrary.rest<Invite[]>(`church_invites?select=id,code,role,expires_at&church_id=eq.${churchId}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc`, { signedIn: true })
    return data || []
}
export async function revokeInvite(id: string) {
    await churchLibrary.rest(`church_invites?id=eq.${id}`, { method: "DELETE", signedIn: true })
}

// PLAN //

export type PaidPlan = "church" | "multi_campus"
// prices as Stripe holds them (lookup keys scriptural_project_<plan>_<period>); limits as church_limits has them
export const PLANS: { id: PaidPlan; name: string; monthly: number; yearly: number; includes: string }[] = [
    { id: "church", name: "Church", monthly: 19, yearly: 190, includes: "10 people, any number of songs, 1,000 Scriptural AI requests a month" },
    { id: "multi_campus", name: "Multi-campus", monthly: 49, yearly: 490, includes: "50 people, any number of songs, 5,000 Scriptural AI requests a month" }
]
export const PLAN_NAMES: Record<string, string> = { free: "Free", church: "Church", multi_campus: "Multi-campus" }
export const priceId = (plan: PaidPlan, yearly: boolean) => `${plan}_${yearly ? "yearly" : "monthly"}`

const FAILED = ["past_due", "unpaid", "incomplete"]

export interface PlanState {
    plan: string
    maxMembers: number | null
    paymentFailed: boolean
    /** a paid plan given by hand: nothing is charged and there is no billing page */
    comped: boolean
    canManageBilling: boolean
}

export function planState(limits: { plan: string; max_members: number | null } | undefined, subscription: { status: string; stripe_subscription_id: string | null } | null): PlanState {
    const plan = limits?.plan || "free"
    const billed = !!subscription?.stripe_subscription_id
    const paymentFailed = billed && FAILED.includes(subscription!.status)
    return { plan, maxMembers: limits?.max_members ?? null, paymentFailed, comped: plan !== "free" && !billed, canManageBilling: billed && (plan !== "free" || paymentFailed) }
}

export async function loadPlanState(churchId: string): Promise<PlanState> {
    const [limits, { data: rows }] = await Promise.all([rpc<{ plan: string; max_members: number }[]>("church_limits", { target: churchId }), churchLibrary.rest<{ status: string; stripe_subscription_id: string | null }[]>(`church_subscriptions?select=status,stripe_subscription_id&church_id=eq.${churchId}`, { signedIn: true })])
    return planState(limits?.[0], rows?.[0] || null)
}

/** Something is on a screen: no upgrade prompts until it is cleared. */
export const isLive = (outputs: { [id: string]: { out?: any } }) => Object.values(outputs).some((output) => !!output.out?.slide)

// DELETE AND EXPORT //

async function callDelete(body: object) {
    const { ok, data } = await churchLibrary.invoke<{ deleted?: boolean; message?: string }>("church-delete", body)
    if (!ok || !data.deleted) throw new ScripturalError(data.message || "Nothing was deleted. Try again.")
}
export const deleteChurch = (churchId: string, confirmName: string) => callDelete({ scope: "church", churchId, confirmName })
export const deleteAccount = () => callDelete({ scope: "account" })

const PAGE_SIZE = 1000

/** The church's songs as one JSON file's text. */
export async function exportSongs(churchId: string, churchName: string): Promise<string> {
    const songs: { id: string }[] = []
    let after = ""
    for (;;) {
        const { data } = await churchLibrary.rest<{ id: string }[]>(`songs?select=id,title,authors,copyright,ccli,song_key,tempo,sections,arrangement,notes,tags,created_at,updated_at&church_id=eq.${churchId}&deleted_at=is.null${after ? `&id=gt.${after}` : ""}&order=id.asc&limit=${PAGE_SIZE}`, { signedIn: true })
        songs.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) break
        after = data[data.length - 1].id
    }
    return JSON.stringify({ church: churchName, exported_at: new Date().toISOString(), songs }, null, 2)
}
