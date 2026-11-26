// A plan holds presentations, not references: a passage added to one is saved as slides,
// the way the app makes them from a plan imported with scripture in it.

import { get } from "svelte/store"
import { uid } from "uid"
import { generateScriptureShowFromReference } from "../../components/drawer/bible/scripture"
import { history } from "../../components/helpers/history"
import { setActiveScripture } from "../../converters/bible"
import { activeScripture, drawerTabsData } from "../../stores"

/** null when the passage is not in that Bible. The operator's open Bible and passage stay as they were. */
export async function passageShow(reference: string, tabId: string): Promise<{ id: string; name: string } | null> {
    const open = get(drawerTabsData).scripture?.activeSubTab || ""
    const looking = get(activeScripture)
    try {
        setActiveScripture(tabId)
        const show = await generateScriptureShowFromReference(reference)
        if (!show) return null
        const id = uid()
        history({ id: "SHOWS", newData: { data: [{ id, show }] } })
        return { id, name: show.name }
    } finally {
        setActiveScripture(open)
        activeScripture.set(looking)
    }
}
