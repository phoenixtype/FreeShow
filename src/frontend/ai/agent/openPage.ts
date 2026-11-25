import { get } from "svelte/store"
import { openDrawer } from "../../components/edit/scripts/edit"
import { activePage } from "../../stores"
import type { PageName } from "../voice/matthias"

/** takes the operator to a page or a tab of the drawer */
export function openPage(page: PageName) {
    if (page === "show" || page === "edit" || page === "stage" || page === "draw" || page === "settings") return activePage.set(page)
    if (get(activePage) !== "edit") activePage.set("show")
    openDrawer(page === "songs" ? "shows" : page)
}
