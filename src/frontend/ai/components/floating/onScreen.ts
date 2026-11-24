import type { OutSlide, TrimmedShows } from "../../../../types/Show"

/** A short name for what a screen shows: the passage, or the song's name. */
export function onScreenTitle(slide: OutSlide | null | undefined, shows: TrimmedShows): string {
    if (!slide) return ""
    if (slide.id === "temp") {
        const reference = slide.customDynamicValues?.scripture_reference
        return typeof reference === "string" ? reference.replace(/<[^>]*>/g, "").trim() : ""
    }
    return shows[slide.id]?.name || slide.name || ""
}

/** The projector window is closed: the preview is right, but nobody else sees it. */
export function isScreenOff(id: string | undefined, states: { id: string; active: boolean | "invisible" }[]): boolean {
    if (!id) return false
    return states.find((a) => a.id === id)?.active !== true
}
