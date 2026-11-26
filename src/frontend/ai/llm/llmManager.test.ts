import { beforeEach, expect, it, vi } from "vitest"
const { requestMain, sendMain, plan } = vi.hoisted(() => ({ requestMain: vi.fn(), sendMain: vi.fn(), plan: vi.fn() }))
vi.mock("../../IPC/main", () => ({ requestMain, sendMain }))
vi.mock("../../scriptural/ai", () => ({ completeWithScripturalAI: plan }))
vi.mock("../../components/edit/scripts/itemHelpers", () => ({ getEditItems: () => [] }))
vi.mock("../agent/agentChat", () => ({ agentInstructions: () => "", runAgentChat: vi.fn(), AGENT_SCHEMA_FIELDS: {} }))
vi.mock("../scripture/passage", () => ({ readPassage: vi.fn() }))
vi.mock("../../stores", async () => ({ ai: (await import("svelte/store")).writable({ llm: { provider: "scriptural", localFallback: "gemma3:4b" } }) }))
import { LLMManager } from "./llmManager"
import { STT_CONTROLLER_PROMPT, STT_CONTROLLER_SCHEMA } from "./prompts"

const schema = { type: "object", properties: { content: { type: "string" } }, required: ["content"] }
const ask = (extra = {}) => new LLMManager("scriptural", "").request<any>({ prompt: "hi", jsonSchema: schema, ...extra })
beforeEach(() => {
    requestMain.mockReset()
    plan.mockReset().mockResolvedValue({ text: '{"content":"Claude"}' })
})

it("does not spend the plan when this computer can answer", async () => {
    requestMain.mockResolvedValue({ text: '{"content":"local"}' })
    expect((await ask()).content).toBe("local")
    expect(plan).not.toHaveBeenCalled()
})

it.each([
    ["is not running", { text: "", error: "down" }],
    ["answers in broken JSON", { text: "{oops" }],
    ["leaves fields out", { text: "{}" }]
])("asks Claude when the local model %s", async (_, reply) => {
    requestMain.mockResolvedValue(reply)
    expect((await ask()).content).toBe("Claude")
})

it("goes straight to Claude once a turn is struggling", async () => {
    expect((await ask({ struggling: true })).content).toBe("Claude")
    expect(requestMain).not.toHaveBeenCalled()
})

it("asks Claude about a sermon only every 60 words when the local model is down", async () => {
    requestMain.mockResolvedValue({ text: "", error: "down" })
    plan.mockResolvedValue({ text: '{"type":"empty","content":"","confidence":1}' })
    const manager = new LLMManager("scriptural", "")
    for (let i = 0; i < 8; i++) await manager.detectMatch({ chunkWithOverlap: "words", newWordsCount: 15 })
    expect(requestMain).toHaveBeenCalledTimes(8)
    expect(plan).toHaveBeenCalledTimes(2)
})

it("stops the call on this computer and asks no other model once it is cancelled", async () => {
    requestMain.mockImplementation((id: string) => (id === "AI_LLM_COMPLETE" ? new Promise(() => {}) : Promise.resolve()))
    const controller = new AbortController()
    const answer = ask({ signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    expect(await answer).toBeNull()
    const sent = requestMain.mock.calls.find((call) => call[0] === "AI_LLM_COMPLETE")![1]
    expect(sendMain).toHaveBeenCalledWith("AI_LLM_CANCEL", { requestId: sent.requestId })
    expect(plan).not.toHaveBeenCalled()
})

it("says which requests are only listening", async () => {
    requestMain.mockResolvedValue({ text: "", error: "down" })
    await new LLMManager("scriptural", "").detectMatch({ chunkWithOverlap: "words", newWordsCount: 60 })
    expect(plan.mock.calls[0][1]).toBe("listen")
    plan.mockClear()
    await ask()
    expect(plan.mock.calls[0][1]).toBe("ask")
})

it("asks a listening model for passages only, and drops anything else it answers (E8)", async () => {
    expect(STT_CONTROLLER_SCHEMA.properties.type.enum).toEqual(["scripture", "empty"])
    expect(STT_CONTROLLER_PROMPT).not.toMatch(/"(lyrics|quote|announcement)"/)

    requestMain.mockResolvedValue({ text: '{"type":"lyrics","content":"Amazing Grace","confidence":90}' })
    expect(await new LLMManager("scriptural", "").detectMatch({ chunkWithOverlap: "words", newWordsCount: 500 })).toBeNull()
})
