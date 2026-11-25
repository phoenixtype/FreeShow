// Where a suggestion sits: just above the drawer on the pages that have one (so it never
// covers the drawer's panels or lists), in the corner elsewhere.
import { derived } from "svelte/store"
import { activePage, drawer, focusMode } from "../../../stores"

const GAP = 16
const CORNER = 16

export const bubbleBottom = derived([activePage, drawer, focusMode], ([$page, $drawer, $focus]) => {
    const hasDrawer = ($page === "show" || $page === "edit") && !$focus
    return hasDrawer ? Math.round(($drawer?.height || 0) + GAP) : CORNER
})
