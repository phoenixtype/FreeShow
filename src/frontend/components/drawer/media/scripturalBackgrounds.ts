// Scriptural's backgrounds: David Roberts' Holy Land drawings (1839) and
// photochrom prints (about 1895), public domain, cropped to 16:9 for the
// screen. The list lives on project.scriptural.online so new packs arrive
// without an app update (scripts/backgrounds builds it).

const MANIFEST = "https://project.scriptural.online/backgrounds/manifest.json"

interface Background {
    id: string
    label: string
    region: string
    credit: string
    url: string
    preview: string
}

let all: Background[] | null = null

export async function loadScripturalBackgrounds(search = ""): Promise<{ path: string; previewUrl: string; name: string; extension: string }[]> {
    if (!all) {
        try {
            const response = await fetch(MANIFEST)
            all = response.ok ? ((await response.json()).items as Background[]) : []
        } catch {
            return []
        }
    }
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((b) => words.every((w) => `${b.label} ${b.region} ${b.credit}`.toLowerCase().includes(w))).map((b) => ({ path: b.url, previewUrl: b.preview, name: `${b.label} (${b.credit})`, extension: "webp" }))
}
