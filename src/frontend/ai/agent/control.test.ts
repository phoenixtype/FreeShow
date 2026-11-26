import { readFileSync } from "node:fs"
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
import { askingToLead, cancelAgentMode, confirmAgentMode, handBack, HOLD_MS, heldUntil, isHeld, movedByHand, OwnChanges, screenHolder, setAgentMode } from "./control"

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
})

describe("agent mode", () => {
    it("is asked about once before it is first turned on, never switched on by one click", () => {
        expect(setAgentMode(true)).toBe(false)
        expect(get(askingToLead)).toBe(true)
        expect(get(ai).matthias?.agentMode).toBeFalsy()
        expect(toggleSttListening).not.toHaveBeenCalled()

        cancelAgentMode()
        expect(get(askingToLead)).toBe(false)
        expect(setAgentMode(true)).toBe(false)

        confirmAgentMode()
        expect(get(askingToLead)).toBe(false)
        expect(get(ai).matthias?.agentMode).toBe(true)
        // it can only lead what it hears
        expect(toggleSttListening).toHaveBeenCalledWith({ value: true })

        // asked once each time the app runs
        setAgentMode(false)
        expect(setAgentMode(true)).toBe(true)
        expect(get(ai).matthias?.agentMode).toBe(true)
    })

    it("asks in these words, with Turn on and Cancel, everywhere it can be turned on", () => {
        const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
        const confirm = read("../components/floating/AgentConfirm.svelte")
        expect(confirm).toContain("will change the screen on its own and use AI requests.")
        expect(confirm).toContain(">Turn on<")
        expect(confirm).toContain(">Cancel<")
        expect(confirm).toContain("justify-content: flex-end")
        expect(read("../components/floating/ScreenControl.svelte")).toContain("<AgentConfirm />")
        expect(read("../components/settings/MatthiasOptions.svelte")).toContain("<AgentConfirm />")
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
