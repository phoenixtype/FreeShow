// The Live Copilot's view of the song library: the index it listens against,
// and putting a song up at the slide being sung.

import { get } from "svelte/store"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { getLayoutRef } from "../../components/helpers/show"
import { startShow } from "../../components/helpers/showActions"
import { loadShows } from "../../components/helpers/setShow"
import { shows, showsCache, textCache } from "../../stores"
import { bestSlide, SongDetector, SongIndex } from "./songDetection"

let detector: SongDetector | null = null
let builtFrom: unknown = null

// rebuilt only when the library's text changes (an import, a sync, an edit)
export function songDetector(): SongDetector | null {
    const cache = get(textCache)
    if (detector && builtFrom === cache) return detector

    const list = Object.entries(get(shows))
        .filter(([id, show]) => typeof cache[id] === "string" && !show?.private)
        .map(([id, show]) => ({ id, name: show.name || "", text: cache[id] as string }))
    if (!list.length) return null

    detector = new SongDetector(new SongIndex(list))
    builtFrom = cache
    return detector
}

export function liveShowId(): string {
    return getFirstActiveOutput()?.out?.slide?.id || ""
}

function liveSlideIndex(): number | null {
    const index = getFirstActiveOutput()?.out?.slide?.index
    return typeof index === "number" ? index : null
}

async function slideTexts(showId: string): Promise<string[]> {
    await loadShows([showId])
    const show = get(showsCache)[showId]
    if (!show) return []
    return getLayoutRef(showId).map((ref) =>
        (show.slides[ref.id]?.items || [])
            .flatMap((item) => item?.lines || [])
            .map((line) => (line?.text || []).map((part) => part?.value || "").join(""))
            .join(" ")
    )
}

// Puts the song up at the slide matching what was just sung (else its first slide).
export async function presentSong(showId: string, recent: string) {
    const slides = await slideTexts(showId)
    await startShow(showId, bestSlide(slides, recent) ?? 0)
}

// The song is already up: move to the slide being sung, if it is another one.
export async function followSong(showId: string, recent: string): Promise<boolean> {
    const slides = await slideTexts(showId)
    const live = liveSlideIndex()
    const index = bestSlide(slides, recent, live ?? 0)
    if (index === null || index === live) return false
    await startShow(showId, index)
    return true
}
