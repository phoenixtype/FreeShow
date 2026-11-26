// A window whose page dies (out of memory, a graphics driver fault) is loaded
// again, so an operator is never left with a white window or a black screen
// in the middle of a meeting.

import type { WebContents } from "electron"

const WINDOW_MS = 5 * 60 * 1000
const MAX_RELOADS = 3

/** Whether to load a dead page again: not after a normal exit, and not for one that keeps dying. */
export function shouldReload(reason: string, earlier: number[], now: number): boolean {
    // "killed" is included: it is how the system ends a page when memory runs out
    if (reason === "clean-exit") return false
    return earlier.filter((at) => now - at < WINDOW_MS).length < MAX_RELOADS
}

export function recoverWindow(contents: WebContents, report: (message: string) => void) {
    const reloads: number[] = []
    contents.on("render-process-gone", (_event, details) => {
        const now = Date.now()
        const again = shouldReload(details.reason, reloads, now)
        report(`A window stopped (${details.reason}, code ${details.exitCode})${again ? ", loading it again" : ""}`)
        if (!again) return

        reloads.push(now)
        // after the event returns: reloading from inside it can crash the app
        setTimeout(() => {
            if (!contents.isDestroyed()) contents.reload()
        }, 500)
    })
}
