// Puts a passage up without moving the operator: their page, drawer tab and open song stay
// where they are. With the Scripture tab open it follows there, as it always has.

import { get } from "svelte/store"
import { resolveScriptureRequest, startScripture } from "../../components/actions/apiHelper"
import { playScripture, scriptureDrawerOpen, screenScripture } from "../../components/drawer/bible/scripture"
import { setActiveScripture } from "../../converters/bible"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { ANCIENT_FIRST_BOOK, isAncientWritings, listeningBibleId } from "../../scriptural/ancientRules"
import { activeScripture, drawerTabsData, outLocked, scriptures } from "../../stores"

export async function presentPassage(reference: string, id = ""): Promise<boolean> {
    if (get(outLocked)) return false
    // the ancient writings go up only when the operator picks a verse in them, never from a request
    if ((id && isAncientWritings(id)) || Number(reference.split(".")[0]) >= ANCIENT_FIRST_BOOK) return false
    const open = get(drawerTabsData).scripture?.activeSubTab || ""
    if (get(scriptureDrawerOpen)) {
        const other = id || (isAncientWritings(open) ? listeningBibleId(open) : "")
        await startScripture({ reference, ...(other ? { id: other } : {}) })
        return true
    }

    // the Scripture tab opens the first Bible when the last one is gone
    const tab = id || listeningBibleId(get(scriptures)[open] ? open : Object.keys(get(scriptures))[0] || "")
    if (!tab) return false
    const resolved = await resolveScriptureRequest({ reference, id: tab })
    if (!resolved) return false
    if (tab !== open) setActiveScripture(tab)
    const version = get(scriptures)[tab]?.collection?.versions?.[0] || tab
    activeScripture.set({ id: version, reference: { book: resolved.book, chapters: [resolved.chapter], verses: resolved.verses } })
    await playScripture()
    return true
}

/** the passage that is up, else the one the operator has open */
export function currentScripture() {
    const up = get(screenScripture)
    return up?.reference?.book && getFirstActiveOutput()?.out?.slide?.id === "temp" ? up : get(activeScripture)
}

/** "" when the open tab already shows this version, so a collection of versions stays together */
export function otherTab(version: string): string {
    const open = get(drawerTabsData).scripture?.activeSubTab || ""
    const versions = get(scriptures)[open]?.collection?.versions || [open]
    return versions.includes(version) ? "" : version
}
