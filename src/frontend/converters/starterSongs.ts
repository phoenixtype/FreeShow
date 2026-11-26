// The starter pack: added only when asked for, through the same text import songs come in by.

import { get } from "svelte/store"
import { formatToFileName } from "../components/helpers/show"
import { categories, shows } from "../stores"
import { newToast } from "../utils/common"
import { setTempShows } from "./importHelpers"
import { STARTER_HYMNS, type StarterHymn } from "./starterSongs.data"
import { convertText } from "./txt"

// the same id every time, so a second press (or a renamed hymn) adds nothing
const showId = (hymn: StarterHymn) => `starter_${hymn.id}`
const songText = (hymn: StarterHymn) => `title=${hymn.title}\nauthor=${hymn.author}\nyear=${hymn.year}\ncopyright=Public Domain\n\n${hymn.words}`
const asFileName = (name: string) => formatToFileName(name).toLowerCase()

export function addStarterHymns(): number {
    const library = get(shows)
    const names = new Set(Object.values(library).map((a) => asFileName(a.name || "")))
    const missing = STARTER_HYMNS.filter((hymn) => !library[showId(hymn)] && !names.has(asFileName(hymn.title)))
    if (!missing.length) {
        newToast("The starter hymns are already in your songs")
        return 0
    }

    const category = get(categories).song ? "song" : null
    const songs = missing.map((hymn) => ({ id: showId(hymn), show: convertText({ name: hymn.title, category, text: songText(hymn), noFormatting: true, returnData: true }).show }))
    // quiet: nothing is opened, added to the plan or put on screen
    setTempShows(songs, { quiet: true, suppressFinishedToast: true })
    newToast(`Added ${songs.length} ${songs.length === 1 ? "hymn" : "hymns"} to your songs`)
    return songs.length
}
