// The Live Copilot's view of the song library: the index it listens against,
// and putting a song up at the slide being sung.

import { get } from "svelte/store"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { getLayoutRef } from "../../components/helpers/show"
import { startShow } from "../../components/helpers/showActions"
import { loadShows } from "../../components/helpers/setShow"
import { shows, showsCache, textCache } from "../../stores"
import { findSection } from "./sections"
import { bestSlide, SongDetector, SongIndex } from "./songDetection"

let detector: SongDetector | null = null
let builtFrom: unknown = null
let builtTexts = new Map<string, string>()

// rebuilt only when a song's words change (an import, a sync, an edit). The
// text cache is replaced whenever any show is opened, usually with the same
// words, and a rebuild would throw away what has been heard so far.
export function songDetector(): SongDetector | null {
    const cache = get(textCache)
    if (detector && builtFrom === cache) return detector

    const list = Object.entries(get(shows))
        .filter(([id, show]) => typeof cache[id] === "string" && !show?.private)
        .map(([id, show]) => ({ id, name: show.name || "", text: cache[id] as string }))
    builtFrom = cache
    if (!list.length) return (detector = null)

    const same = detector && list.length === builtTexts.size && list.every((song) => builtTexts.get(song.id) === song.text)
    if (same) return detector

    detector = new SongDetector(new SongIndex(list))
    builtTexts = new Map(list.map((song) => [song.id, song.text]))
    return detector
}

export const findSongsByLine = (line: string) => songDetector()?.find(line) || []

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

/** the song that is up goes to its chorus, bridge or verse; null when it has none */
export async function showSection(name: string, number?: number): Promise<string | null> {
    const showId = liveShowId()
    if (!showId || showId === "temp") return null
    await loadShows([showId])
    const show = get(showsCache)[showId]
    if (!show) return null
    const slides = getLayoutRef(showId)
        .map((ref, index) => ({ index, id: ref.id, group: ref.type === "parent" ? show.slides[ref.id]?.group || show.slides[ref.id]?.globalGroup || "" : "" }))
        .filter((slide) => slide.group)
    const index = findSection(slides, name, number, liveSlideIndex() ?? -1)
    if (index === null) return null
    await startShow(showId, index)
    return slides.find((slide) => slide.index === index)?.group || name
}

/** to a slide of the song that is up, from 1 */
export async function showSlide(slide: number | "last"): Promise<number> {
    const showId = liveShowId()
    if (!showId || showId === "temp") return 0
    await loadShows([showId])
    const total = getLayoutRef(showId).length
    const wanted = slide === "last" ? total : slide
    if (wanted < 1 || wanted > total) return 0
    await startShow(showId, wanted - 1)
    return wanted
}
