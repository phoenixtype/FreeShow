import { beforeEach, expect, it, vi } from "vitest"
const { requestMain, plan } = vi.hoisted(() => ({ requestMain: vi.fn(), plan: vi.fn() }))
vi.mock("../../IPC/main", () => ({ requestMain }))
vi.mock("../../scriptural/ai", () => ({ completeWithScripturalAI: plan }))
vi.mock("../../components/edit/scripts/itemHelpers", () => ({ getEditItems: () => [] }))
vi.mock("../agent/agentChat", () => ({ agentInstructions: () => "", runAgentChat: vi.fn(), AGENT_SCHEMA_FIELDS: {} }))
vi.mock("../scripture/passage", () => ({ readPassage: vi.fn() }))
vi.mock("../../stores", async () => ({ ai: (await import("svelte/store")).writable({ llm: { provider: "scriptural", localFallback: "gemma3:4b" } }) }))
import { LLMManager } from "./llmManager"

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
