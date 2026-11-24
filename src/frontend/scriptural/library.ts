// Scriptural's library in Quick search: loops, pictures and sounds, all free for any church
// to use. Choosing one saves the file on this computer, so the service never waits on the
// internet, and puts it in the open service.

import { get } from "svelte/store"
import { Main } from "../../types/IPC/Main"
import { requestMain } from "../IPC/main"
import { activeProject, activeShow, projects } from "../stores"
import { newToast } from "../utils/common"

const BACKGROUNDS = "https://project.scriptural.online/backgrounds/library.json"
const SOUNDS = "https://project.scriptural.online/sounds/library.json"
// the largest loop on a slow church connection
const SAVE_WAIT_MS = 5 * 60 * 1000 + 5000

export interface LibraryItem {
    id: string
    label: string
    type: "video" | "image" | "audio"
    url: string
    preview?: string
    words: string
}

const KINDS = {
    video: { icon: "movie", name: "Loop", words: "loop loops video motion background" },
    image: { icon: "image", name: "Picture", words: "image picture photo still background" },
    audio: { icon: "music", name: "Sound", words: "sound audio music" }
}

let items: LibraryItem[] | null = null
let loading: Promise<LibraryItem[]> | null = null

async function fetchList(url: string): Promise<any[]> {
    try {
        const response = await fetch(url)
        return response.ok ? (await response.json()).items || [] : []
    } catch {
        return []
    }
}

async function load(): Promise<LibraryItem[]> {
    if (items) return items
    loading ||= Promise.all([fetchList(BACKGROUNDS), fetchList(SOUNDS)]).then(([backgrounds, sounds]) => {
        const list = [...backgrounds, ...sounds].map(({ id, label, type, url, preview, categories }) => ({ id, label, type, url, preview, words: `${label} ${(categories || []).join(" ")} ${KINDS[type]?.words || ""}`.toLowerCase() })).filter((item) => KINDS[item.type])
        // offline: ask again next time
        if (list.length) items = list
        loading = null
        return list
    })
    return loading
}

/** every word typed has to fit; a name that starts with what was typed comes first */
export function matchLibrary(list: LibraryItem[], search: string, max: number): LibraryItem[] {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const hits = list.filter((item) => words.every((word) => item.words.split(" ").some((own) => own.startsWith(word))))
    const rank = (item: LibraryItem) => (item.label.toLowerCase().startsWith(words[0]) ? 0 : 1)
    return hits.sort((a, b) => rank(a) - rank(b)).slice(0, max)
}

export async function searchLibrary(search: string, max: number) {
    if (search.trim().length < 2) return []
    return matchLibrary(await load(), search, max).map((item) => ({ id: `library-${item.id}`, name: item.label, icon: KINDS[item.type].icon, description: KINDS[item.type].name, data: item }))
}

const extensionOf = (url: string) => new URL(url).pathname.split(".").pop() || ""

export async function addFromLibrary(item: LibraryItem) {
    newToast(`Saving ${item.label}`)
    const saved = await requestMain(Main.SAVE_MEDIA, { source: item.url, name: `${item.label}.${extensionOf(item.url)}`, reuse: true }, undefined, SAVE_WAIT_MS)
    if (!saved?.path) {
        newToast(saved?.error || "It could not be saved. Check the connection and try again.")
        return
    }

    const media = { id: saved.path, name: item.label, type: item.type }
    const projectId = get(activeProject)
    if (projectId && get(projects)[projectId]?.shows) {
        projects.update((all) => {
            all[projectId].shows.push(media)
            all[projectId].modified = Date.now()
            return all
        })
        newToast(`${item.label} is in ${get(projects)[projectId].name}`)
    } else newToast(`${item.label} is saved in your media folder`)

    activeShow.set(media)
}
