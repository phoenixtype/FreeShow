import { describe, expect, it, vi } from "vitest"
vi.mock("../../components/actions/apiHelper", () => ({ toggleSttListening: vi.fn() }))
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { ai: writable({ enabled: true, stt: { micDeviceId: "mic" } }) }
})
vi.mock("../liveCopilot", async () => {
    const { writable } = await import("svelte/store")
    return { copilotListening: writable(false) }
})
vi.mock("../scripture/BibleCacheManager", () => ({ BibleCacheManager: { getCanon: vi.fn() } }))
import { get } from "svelte/store"
import { toggleSttListening } from "../../components/actions/apiHelper"
import { ai } from "../../stores"
import { handBack, HOLD_MS, heldUntil, isHeld, movedByHand, OwnChanges, screenHolder, setAgentMode } from "./control"

describe("who has the screen", () => {
    it("is the operator's after a move by hand, until handed back", () => {
        movedByHand()
        expect(isHeld()).toBe(true)
        expect(screenHolder(true, get(heldUntil), Date.now())).toBe("held")
        expect(screenHolder(true, get(heldUntil), Date.now() + HOLD_MS + 1)).toBe("matthias")
        handBack()
        expect(isHeld()).toBe(false)
        expect(screenHolder(false, 0, 0)).toBe("operator")
    })
    it("starts listening when it is given the lead", () => {
        setAgentMode(true)
        expect(get(ai).matthias?.agentMode).toBe(true)
        expect(toggleSttListening).toHaveBeenCalledWith({ value: true })
    })
})

describe("OwnChanges", () => {
    it("waits for a slow passage and knows it when it lands", () => {
        const own = new OwnChanges()
        own.expect("passage", 0)
        expect(own.isOwn({ id: "temp" }, 5000)).toBe(true)
        expect(own.isOwn({ id: "temp" }, 7000)).toBe(false)
    })
    it("sees the operator put up something else meanwhile", () => {
        const own = new OwnChanges()
        own.expect("passage", 0)
        expect(own.isOwn({ id: "song" }, 200)).toBe(false)
        expect(own.isOwn(null, 300)).toBe(false)
        own.expect({ show: "song" }, 0)
        expect(own.isOwn({ id: "song" }, 100)).toBe(true)
        own.expect("nothing", 0)
        expect(own.isOwn(null, 100)).toBe(true)
    })
    it("takes any change only until it is over", () => {
        const own = new OwnChanges()
        own.expect("any", 0)
        own.settle(1000)
        expect(own.isOwn({ id: "x" }, 2000)).toBe(true)
        expect(own.isOwn({ id: "x" }, 2600)).toBe(false)
    })
})
