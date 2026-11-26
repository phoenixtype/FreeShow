// What the app's windows may do with a link: stay on the app's own pages, never
// open a second Electron window, and hand only ordinary links to the computer.

import type { WebContents } from "electron"
import path from "path"
import { fileURLToPath } from "url"

const EXTERNAL = new Set(["https:", "http:", "mailto:", "spotify:", "x-apple.systempreferences:"])
const DEV_SERVER = "http://localhost:3000"

export function isAllowedExternalUrl(url: string): boolean {
    try {
        return EXTERNAL.has(new URL(url).protocol)
    } catch {
        return false
    }
}

/** one of the app's own pages */
export function isAppUrl(url: string, appPath: string, isProd: boolean): boolean {
    try {
        const parsed = new URL(url)
        if (parsed.protocol === "file:") return fileURLToPath(parsed).startsWith(path.resolve(appPath) + path.sep)
        return !isProd && parsed.origin === DEV_SERVER
    } catch {
        return false
    }
}

export function guardContents(contents: WebContents, { appPath, isProd, open }: { appPath: string; isProd: boolean; open: (url: string) => void }) {
    // a website put on a slide lives in a webview: it browses as websites do
    const webview = contents.getType() === "webview"

    contents.setWindowOpenHandler(({ url }) => {
        if (!webview) open(url)
        return { action: "deny" }
    })

    if (webview) return
    contents.on("will-navigate", (event, url) => {
        if (!isAppUrl(url, appPath, isProd)) event.preventDefault()
    })
}
