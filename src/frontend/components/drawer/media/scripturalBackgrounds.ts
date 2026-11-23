// Scriptural's backgrounds: motion loops, gradients and countdowns we render
// ourselves, public-domain Holy Land pictures, and CC0 or public-domain photos
// and film. The list lives on project.scriptural.online so new backgrounds
// arrive without an app update (scripts/backgrounds builds it).

const LIBRARY = "https://project.scriptural.online/backgrounds/library.json"

interface Background {
    id: string
    label: string
    categories: string[]
    type: "image" | "video"
    credit: string
    url: string
    preview: string
}

export interface BackgroundCategory {
    id: string
    label: string
}

let library: { categories: BackgroundCategory[]; items: Background[] } | null = null

async function load() {
    if (library) return library
    try {
        const response = await fetch(LIBRARY)
        if (response.ok) library = await response.json()
    } catch {
        // offline: the tab shows nothing until the next try
    }
    return library
}

export async function loadScripturalCategories(): Promise<BackgroundCategory[]> {
    return (await load())?.categories || []
}

export async function loadScripturalBackgrounds(search = "", category = ""): Promise<{ path: string; previewUrl: string; name: string; extension: string }[]> {
    const items = (await load())?.items || []
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return items
        .filter((b) => !category || b.categories.includes(category))
        .filter((b) => words.every((w) => `${b.label} ${b.categories.join(" ")} ${b.credit}`.toLowerCase().includes(w)))
        .map((b) => ({
            path: b.url,
            previewUrl: b.preview,
            name: b.credit === "Scriptural" ? b.label : `${b.label} (${b.credit})`,
            extension: b.type === "video" ? "mp4" : "webp"
        }))
}
