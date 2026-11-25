// Running the open service plan, one item after another.

import { get } from "svelte/store"
import { outputProjectItem } from "../../components/actions/apiHelper"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { startShow } from "../../components/helpers/showActions"
import { removeProjectItem } from "../../components/actions/apiHelper"
import { activeProject, activeShow, projects, shows } from "../../stores"
import { matchTitle } from "../voice/matthias"

let lastShown: { plan: string; index: number } | null = null

export function planItems() {
    return (get(projects)[get(activeProject) || ""]?.shows || []).map((item, index) => ({ ...item, index, label: item.name || get(shows)[item.id]?.name || "" })).filter((item) => item.type !== "section")
}

/** where the plan is now: what is on screen, else the last item shown, else the one the operator has open */
function currentIndex(): number {
    const items = planItems()
    const live = getFirstActiveOutput()?.out?.slide?.id
    const last = lastShown?.plan === get(activeProject) ? lastShown!.index : -1
    if (live && items.find((item) => item.index === last)?.id === live) return last
    const onScreen = items.find((item) => item.id === live)
    if (onScreen) return onScreen.index
    return last >= 0 ? last : -1
}

export function nextPlanItem(step: "start" | "next" | "previous") {
    const items = planItems()
    if (step === "start") return items[0] || null
    const current = currentIndex()
    if (step === "next") return items.find((item) => item.index > current) || null
    return [...items].reverse().find((item) => item.index < current) || null
}

/** takes an item off the open plan, and only off the plan: the song stays in the library, and Ctrl+Z brings it back */
export function removeFromOpenPlan(what: string): { plan: string; removed: string } | { error: string } {
    const planId = get(activeProject) || ""
    const plan = get(projects)[planId]
    if (!plan) return { error: "Open a plan first" }
    const items = (plan.shows || []).map((item, index) => ({ id: String(index), name: item.name || get(shows)[item.id]?.name || "" })).filter((item) => item.name)
    const found = matchTitle(what, items)
    if (!found) return { error: `"${what}" is not in ${plan.name}${items.length ? `. It has: ${items.map((item) => item.name).join("; ")}` : ""}` }
    removeProjectItem({ id: planId, index: Number(found.id) })
    return { plan: plan.name, removed: found.name }
}

export type PlanItem = ReturnType<typeof planItems>[number]

export async function showPlanItem(item: PlanItem) {
    if ((item.type || "show") === "show") await startShow(item.id)
    else await outputProjectItem(item)
    lastShown = { plan: get(activeProject) || "", index: item.index }
    // the list shows where the plan is, unless the operator is working on something else
    if (!get(activeShow) || planItems().some((other) => other.id === get(activeShow)?.id)) activeShow.set({ ...item, index: item.index } as any)
}
