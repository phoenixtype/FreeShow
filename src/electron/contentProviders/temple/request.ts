/**
 * Temple (templeadmin.com) through its public API: a church admin makes an API
 * token with "services:read" and pastes it here. Upcoming service plans become
 * projects; their songs become shows built by Planning Center's slide builder.
 *
 * Only TempleProvider imports this file.
 */

import { uid } from "uid"
import { ToMain } from "../../../types/IPC/ToMain"
import type { Show } from "../../../types/Show"
import { getContentProviderAccess, setContentProviderAccess } from "../../data/contentProviders"
import { sendToMain } from "../../IPC/main"
import { httpsRequest } from "../../utils/requests"
import { getShow } from "../planningCenter/request"
import { templeChartSections } from "./chart"

export type TempleScopes = "services"
export type TempleAccess = { access_token: string; church_id: string; church_name: string; created_at: number }

const API_HOST = "https://blvxyvvtoetcvvnakfxi.supabase.co"
const API_BASE = "/functions/v1/public-api/v1"
export const TEMPLE_TOKEN_URL = "https://templeadmin.com/dashboard/settings?tab=system&expand=integrations"

const PROJECT_ID_PREFIX = "temple_"
const SHOW_ID_PREFIX = "templesong_"
const MAX_PLANS = 12
const DAYS_BACK = 7

type TemplePlan = { id: string; title: string; plan_date: string; status: string; notes: string | null; updated_at: string; created_at: string }
type TemplePlanItem = { id: string; position: number; item_type: "item" | "song" | "header"; title: string; song_id: string | null; song_key: string | null; duration_seconds: number; leader_name: string | null; notes: string | null }
type TempleSong = { id: string; title: string; author: string | null; ccli_number: string | null; default_key: string | null; bpm: number | null; chord_chart: string | null; notes: string | null; created_at: string; updated_at: string }
type ProviderProjectItem = { type: "show" | "section"; id: string; scheduleLength: number; name?: string; notes?: string }
type ProviderProject = { id: string; name: string; scheduledTo: number; created: number; folderId: string; folderName: string; items: ProviderProjectItem[] }

class TempleError extends Error {
    constructor(public status: number) {
        super(`HTTP ${status}`)
    }
}

function templeGet<T>(token: string, path: string): Promise<T> {
    return new Promise((resolve, reject) => {
        httpsRequest(API_HOST, API_BASE + path, "GET", { Authorization: `Bearer ${token}` }, {}, (err, result) => {
            if (err) return reject(err.statusCode ? new TempleError(err.statusCode) : err)
            resolve(result as T)
        })
    })
}

/** What to tell the person when Temple refuses. */
export function templeErrorMessage(error: unknown): string {
    const status = error instanceof TempleError ? error.status : 0
    if (status === 401) return "Temple did not accept this token. Make a new one in Temple under Settings, System, Integrations, API tokens."
    if (status === 402) return "Your Temple plan does not include the API. It comes with Growth and Enterprise."
    if (status === 403) return "This Temple token cannot read services. Make one with the services:read permission."
    if (status === 429) return "Temple is busy. Try again in a minute."
    return "Could not reach Temple. Check the internet connection and try again."
}

export function templeAccess(scope: TempleScopes = "services"): TempleAccess | null {
    return getContentProviderAccess("temple", scope)
}

/** Checks a pasted token and keeps it. */
export async function templeConnect(token: string, scope: TempleScopes = "services"): Promise<TempleAccess | null> {
    const cleaned = token.trim()
    if (!cleaned) return null

    try {
        const me = await templeGet<{ data: { church: { id: string; name: string }; scopes: string[] } }>(cleaned, "/me")
        if (!me?.data?.scopes?.includes("services:read")) throw new TempleError(403)

        const access: TempleAccess = { access_token: cleaned, church_id: me.data.church?.id || "", church_name: me.data.church?.name || "", created_at: Date.now() }
        setContentProviderAccess("temple", scope, access)
        sendToMain(ToMain.PROVIDER_CONNECT, { providerId: "temple", success: true, isFirstConnection: true })
        return access
    } catch (error) {
        sendToMain(ToMain.ALERT, templeErrorMessage(error))
        return null
    }
}

export function templeDisconnect(scope: TempleScopes = "services") {
    // the token itself is revoked in Temple; here it is only forgotten
    setContentProviderAccess("temple", scope, null)
}

function localDate(daysFromToday: number): string {
    const date = new Date()
    date.setDate(date.getDate() + daysFromToday)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** Plans from a week ago on, soonest first (the API lists newest first). */
export function upcomingPlans(plans: TemplePlan[], today = localDate(0), daysBack = DAYS_BACK): TemplePlan[] {
    const from = new Date(`${today}T00:00:00`)
    from.setDate(from.getDate() - daysBack)
    const fromDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`
    return plans
        .filter((plan) => plan.plan_date >= fromDate)
        .sort((a, b) => a.plan_date.localeCompare(b.plan_date))
        .slice(0, MAX_PLANS)
}

export function templeSongShow(song: TempleSong): Show & { id: string } {
    const sections = templeChartSections(song.chord_chart)
    const show = getShow(
        { attributes: { title: song.title, author: song.author || "", copyright: "", ccli_number: song.ccli_number || "" } },
        { name: "", chord_chart_key: song.default_key || "", bpm: song.bpm || "", notes: song.notes || "", created_at: song.created_at, updated_at: song.updated_at },
        sections
    )
    show.category = "temple"
    return { id: `${SHOW_ID_PREFIX}${song.id}`, ...show }
}

/** Loads the upcoming plans, or one plan when its project is refreshed. */
export async function templeLoadServices(data?: { token?: string; planId?: string }): Promise<void> {
    let access = templeAccess()
    if (data?.token) access = await templeConnect(data.token)
    if (!access) return

    const token = access.access_token
    try {
        const list = await templeGet<{ data: TemplePlan[] }>(token, "/plans?limit=50")
        const plans = data?.planId ? (list?.data || []).filter((plan) => plan.id === data.planId) : upcomingPlans(list?.data || [])
        if (!plans.length) {
            sendToMain(ToMain.TOAST, "No upcoming service plans in Temple")
            return
        }

        sendToMain(ToMain.TOAST, "Getting service plans from Temple")

        const songs: { [songId: string]: Show & { id: string } } = {}
        const projects: ProviderProject[] = []

        for (const overview of plans) {
            const plan = await templeGet<{ data: TemplePlan & { items: TemplePlanItem[] } }>(token, `/plans/${overview.id}`)
            const items = [...(plan?.data?.items || [])].sort((a, b) => a.position - b.position)

            const projectItems: ProviderProjectItem[] = []
            for (const item of items) {
                if (item.item_type === "song" && item.song_id) {
                    if (!songs[item.song_id]) {
                        const song = await templeGet<{ data: TempleSong }>(token, `/songs/${item.song_id}`)
                        if (song?.data) songs[item.song_id] = templeSongShow(song.data)
                    }
                    if (songs[item.song_id]) {
                        projectItems.push({ type: "show", id: songs[item.song_id].id, scheduleLength: item.duration_seconds || 0 })
                        continue
                    }
                }

                const notes = [item.leader_name, item.notes].filter(Boolean).join("\n")
                projectItems.push({ type: "section", id: uid(5), name: item.title, scheduleLength: item.duration_seconds || 0, notes })
            }

            projects.push({
                id: `${PROJECT_ID_PREFIX}${overview.id}`,
                name: overview.title,
                scheduledTo: new Date(`${overview.plan_date}T00:00:00`).getTime(),
                created: new Date(overview.updated_at || overview.created_at).getTime(),
                folderId: access.church_id ? `temple_${access.church_id}` : "",
                folderName: access.church_name,
                items: projectItems
            })
        }

        sendToMain(ToMain.PROVIDER_PROJECTS, { providerId: "temple", categoryName: "Temple", shows: Object.values(songs), projects })
    } catch (error) {
        sendToMain(ToMain.ALERT, templeErrorMessage(error))
    }
}
