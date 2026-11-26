import { expect, it, vi } from "vitest"
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock("../setup/aiKeys", () => ({ getAiKey: () => "key" }))
vi.mock("./providers/anthropic", () => ({ anthropicProvider: { complete } }))
vi.mock("./providers/google", () => ({ googleProvider: {} }))
vi.mock("./providers/ollama", () => ({ ollamaProvider: {} }))
vi.mock("./providers/openai", () => ({ openaiProvider: {} }))
import { cancelLLM, completeLLM } from "./llmProviders"

it("stops the model call that was cancelled", async () => {
    // the call as the provider sees it: it ends only when its signal says so
    complete.mockImplementation((_key, _model, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("canceled")))))
    const answer = completeLLM({ providerId: "anthropic", model: "m", options: { prompt: "hi" }, requestId: "one" })
    cancelLLM("another")
    cancelLLM("one")
    expect(await answer).toMatchObject({ text: "", error: "canceled" })
})
