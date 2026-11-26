import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../components/actions/apiHelper", () => ({ toggleSttListening: vi.fn() }))
vi.mock("../ai/scripture/BibleCacheManager", () => ({ BibleCacheManager: { getCanon: vi.fn() } }))
vi.mock("../ai/liveCopilot", async () => {
    const { writable } = await import("svelte/store")
    return { copilotListening: writable(false) }
})
vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { ai: writable({}), aiSuggestions: writable([]), outLocked: writable(false), outputs: writable({}), shows: writable({}) }
})
let slide: any = null
vi.mock("../components/helpers/output", () => ({ getFirstActiveOutput: () => ({ out: { slide } }) }))
const connected: any[] = []
const sent: any[] = []
vi.mock("./sendData", () => ({
    eachConnection: (_id: string, channel: string, callback: any) => connected.forEach((c) => callback(c) && sent.push({ id: c.id, channel, data: callback(c) }))
}))

import { get } from "svelte/store"
import { toggleSttListening } from "../components/actions/apiHelper"
import { askingToLead, handBack, movedByHand } from "../ai/agent/control"
import { copilotListening } from "../ai/liveCopilot"
import { ai, aiSuggestions, outLocked } from "../stores"
import { copilotForPhone, remoteCopilot, watchCopilotForRemote } from "./remoteCopilot"

const set = (agentMode: boolean) => ai.set({ enabled: true, stt: { micDeviceId: "mic" }, matthias: { agentMode } } as any)
const offer = (more: object = {}) => ({ id: "a", content: "John 3:16", action: "present", confidence: 80, timestamp: 1, trigger: vi.fn(), ...more })
const ask = async (data: any = null) => (await remoteCopilot({ id: "phone", channel: "COPILOT", data })).data

afterEach(() => {
    set(false)
    aiSuggestions.set([])
    outLocked.set(false)
    copilotListening.set(false)
    handBack()
    slide = null
    connected.length = 0
    sent.length = 0
})

describe("the copilot on the phone", () => {
    it("is not shown until the copilot is set up", () => {
        ai.set({} as any)
        expect(copilotForPhone()).toEqual({ on: false })
    })

    it("says whether it is listening and who has the screen", () => {
        set(false)
        expect(copilotForPhone()).toMatchObject({ on: true, listening: false, holder: "operator", suggestion: null })
        set(true)
        copilotListening.set(true)
        expect(copilotForPhone()).toMatchObject({ listening: true, holder: "matthias", name: "Matthias" })
        movedByHand()
        expect(copilotForPhone()).toMatchObject({ holder: "held" })
    })

    it("offers the latest found passage, without the function behind it, and says when it is already up", () => {
        set(false)
        aiSuggestions.set([offer({ id: "v", action: "open_scripture", content: "NIV" }), offer(), offer({ id: "b", content: "Psalm 23" })])
        expect(copilotForPhone().suggestion).toEqual({ id: "a", content: "John 3:16", onScreen: false })
        slide = { id: "temp", customDynamicValues: { scripture_reference: "John 3:16" } }
        expect(copilotForPhone().suggestion?.onScreen).toBe(true)
    })

    it("takes the screen back from Matthias", async () => {
        set(true)
        const state = await ask({ action: "take" })
        expect(get(ai).matthias?.agentMode).toBe(false)
        expect(state.holder).toBe("operator")
    })

    it("shows a suggestion the way the computer does", async () => {
        set(false)
        const found = offer()
        aiSuggestions.set([found])
        await ask({ action: "show", id: "a" })
        expect(found.trigger).toHaveBeenCalledTimes(1)
    })

    it("never shows on a locked screen, and leaves the lock on", async () => {
        set(false)
        const found = offer()
        aiSuggestions.set([found])
        outLocked.set(true)
        await ask({ action: "show", id: "a" })
        expect(found.trigger).not.toHaveBeenCalled()
        expect(get(outLocked)).toBe(true)
    })

    it("ignores an old id, a Bible switch, and a showing that fails", async () => {
        set(false)
        const version = offer({ id: "v", action: "open_scripture" })
        aiSuggestions.set([version, offer({ id: "x", trigger: () => Promise.reject(new Error("no Bible")) })])
        await ask({ action: "show", id: "gone" })
        await ask({ action: "show", id: "v" })
        expect(version.trigger).not.toHaveBeenCalled()
        await expect(ask({ action: "show", id: "x" })).resolves.toMatchObject({ on: true })
    })

    it("can never start the microphone or agent mode", async () => {
        set(false)
        for (const action of ["listen", "lead", "start", "agent_mode"]) await ask({ action, on: true })
        expect(get(ai).matthias?.agentMode).toBe(false)
        expect(get(askingToLead)).toBe(false)
        expect(toggleSttListening).not.toHaveBeenCalled()
    })

    it("tells signed-in phones when something changes, and only those", () => {
        set(false)
        connected.push({ id: "in", entered: true }, { id: "stranger", entered: false })
        watchCopilotForRemote()
        sent.length = 0
        copilotListening.set(true)
        copilotListening.set(true)
        expect(sent.map((a) => a.id)).toEqual(["in"])
        expect(sent[0].data.listening).toBe(true)
    })
})
