// Adds the books shipped with the app as a local Bible. Nothing is downloaded.

import type { Bible } from "json-bible/lib/Bible"
import { get } from "svelte/store"
import { uid } from "uid"
import { scriptures, scripturesCache } from "../stores"
import { save } from "../utils/save"
import { ancientId } from "./ancientRules"

// built by scripts/buildAncientWritings.js
const FILE = "./ancient-writings.json"

/** the id of the local Bible holding them; adding twice gives the same one */
export async function addAncientWritings(): Promise<string> {
    const existing = ancientId()
    if (existing) return existing

    const response = await fetch(FILE)
    if (!response.ok) throw new Error("The books could not be read")
    const bible = (await response.json()) as Bible

    // pressed again while reading
    const added = ancientId()
    if (added) return added

    const id = uid()
    scripturesCache.update((a) => ({ ...a, [id]: bible }))
    scriptures.set({ ...get(scriptures), [id]: { name: bible.name, id, ancientWritings: true } as any })

    save()
    return id
}
