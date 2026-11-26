// What every agent tool is made of: a plain error, and not saying done before it is.

import { get } from "svelte/store"
import { outLocked } from "../../stores"

export class ToolError extends Error {}

export const text = (description: string) => ({ type: "string", description })

export const requireUnlocked = () => {
    if (get(outLocked)) throw new ToolError("The screen is locked in the app. The operator has to unlock it first.")
}

export const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** waits for the screen to show what was asked, so the answer is what happened and not what was sent */
export async function until(done: () => boolean, timeoutMs = 6000): Promise<boolean> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
        if (done()) return true
        await settle(100)
    }
    return done()
}

/** throws when the screen never shows it: a tool may only say done when it happened */
export async function confirm(done: () => boolean, otherwise: string, timeoutMs = 3000) {
    if (!(await until(done, timeoutMs))) throw new ToolError(otherwise)
}
