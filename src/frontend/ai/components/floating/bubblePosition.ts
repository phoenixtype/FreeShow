// Where the closed Live Copilot bubble sits: just above the drawer on the pages
// that have one (so it never covers the drawer's info panel or lists), in the
// corner elsewhere. SmartAction's suggestion pill lines up with it.
import { derived } from "svelte/store"
import { activePage, drawer, focusMode } from "../../../stores"

const GAP = 16
const CORNER = 45

export const bubbleBottom = derived([activePage, drawer, focusMode], ([$page, $drawer, $focus]) => {
    const hasDrawer = ($page === "show" || $page === "edit") && !$focus
    return hasDrawer ? Math.round(($drawer?.height || 0) + GAP) : CORNER
})
