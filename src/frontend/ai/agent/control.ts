// Who has the screen. The operator's hands always win: moving the screen by hand gives
// them half a minute, which they can cut short or keep for good.

import { get, writable } from "svelte/store"
import { toggleSttListening } from "../../components/actions/apiHelper"
import { ai } from "../../stores"
import { copilotListening } from "../liveCopilot"
import { BibleCacheManager } from "../scripture/BibleCacheManager"

export const HOLD_MS = 30_000

/** the operator has the screen until then */
export const heldUntil = writable(0)
/** counts every time the screen was moved by hand, so a running request can see that it was */
export const handMoves = writable(0)

export const isHeld = () => Date.now() < get(heldUntil)

export function movedByHand() {
    handMoves.update((n) => n + 1)
    heldUntil.set(Date.now() + HOLD_MS)
}

/** Matthias may go on now */
export function handBack() {
    if (get(heldUntil)) heldUntil.set(0)
}

/** full agent mode: the copilot leads the screen by itself until told otherwise */
export function setAgentMode(on: boolean) {
    ai.update((a) => ({ ...a, matthias: { ...(a.matthias || {}), agentMode: on } }))
    handBack()
    if (!on) return

    // it can only lead what it hears
    const settings = get(ai)
    if (settings.enabled && settings.stt?.micDeviceId && !get(copilotListening)) toggleSttListening({ value: true })
    // whatever Bible is needed should be ready before the first word of it
    void BibleCacheManager.getCanon()
}

export type ScreenHolder = "operator" | "matthias" | "held"

export function screenHolder(agentMode: boolean, held: number, now: number): ScreenHolder {
    if (!agentMode) return "operator"
    return now < held ? "held" : "matthias"
}

// The change the copilot is about to make. A change that looks like something else, even
// while this one is still loading, was made by the operator.
export type OwnChange = "passage" | "nothing" | "any" | { show: string }

const LOADING_MS = 8000
const SETTLING_MS = 1500

export class OwnChanges {
    private expected: OwnChange | null = null
    private until = 0
    private landed = false

    expect(change: OwnChange, now = Date.now()) {
        this.expected = change
        this.until = now + LOADING_MS
        this.landed = false
    }

    /** the change is known to be over: nothing later is taken for it */
    settle(now = Date.now()) {
        if (!this.landed) this.until = Math.min(this.until, now + SETTLING_MS)
        this.landed = true
    }

    isOwn(slide: { id?: string } | null, now = Date.now()): boolean {
        if (!this.expected || now > this.until || !this.fits(slide)) return false
        if (!this.landed && this.expected !== "any") this.settle(now)
        return true
    }

    private fits(slide: { id?: string } | null) {
        if (this.expected === "any") return true
        if (this.expected === "nothing") return !slide
        if (this.expected === "passage") return slide?.id === "temp"
        return !!this.expected && slide?.id === this.expected.show
    }
}
