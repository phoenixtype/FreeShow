// Cloudflare Pages Function: /download/mac, /download/mac-intel, /download/windows,
// /download/linux and /download/source go to the newest published file, so the pages
// never need editing for a new version.
const LATEST = "https://api.github.com/repos/phoenixtype/FreeShow/releases/latest"

const FILES = {
    mac: (name) => name.endsWith("arm64.dmg"),
    "mac-intel": (name) => name.endsWith("x64.dmg"),
    windows: (name) => name.endsWith(".exe"),
    linux: (name) => name.endsWith("x86_64.AppImage"),
    source: (name) => name.endsWith("-source.tar.gz")
}

async function newestFile(matches) {
    // kept for ten minutes at the edge; a failed answer is never kept
    const response = await fetch(LATEST, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "scriptural-project-site" },
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 600, "300-599": 0 } }
    })
    if (!response.ok) return null
    const release = await response.json()
    return release.assets?.find((asset) => matches(asset.name))?.browser_download_url || null
}

export async function onRequestGet({ params, next }) {
    if (!Object.hasOwn(FILES, params.os)) return next()

    const url = await newestFile(FILES[params.os]).catch(() => null)
    if (url) return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } })

    return new Response("The download did not start. Try again in a minute, or email support@scriptural.online.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    })
}
