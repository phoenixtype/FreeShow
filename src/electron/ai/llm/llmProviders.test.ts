import { readFileSync } from "node:fs"
import { expect, it, vi } from "vitest"
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock("../setup/aiKeys", () => ({ getAiKey: () => "key" }))
vi.mock("./providers/anthropic", () => ({
    anthropicProvider: {
        complete,
        fallbackModel: "claude-haiku-5-5",
        fetchModels: async () => [
            { id: "claude-opus-5-5", name: "Opus" },
            { id: "claude-haiku-5-5", name: "Haiku" }
        ]
    }
}))
vi.mock("./providers/google", () => ({ googleProvider: {} }))
vi.mock("./providers/ollama", () => ({ ollamaProvider: {} }))
vi.mock("./providers/openai", () => ({ openaiProvider: {} }))
import { cancelLLM, completeLLM, fetchProviderModels } from "./llmProviders"

it("stops the model call that was cancelled", async () => {
    // the call as the provider sees it: it ends only when its signal says so
    complete.mockImplementation((_key, _model, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("canceled")))))
    const answer = completeLLM({ providerId: "anthropic", model: "m", options: { prompt: "hi" }, requestId: "one" })
    cancelLLM("another")
    cancelLLM("one")
    expect(await answer).toMatchObject({ text: "", error: "canceled" })
})

it("marks the model to use unless another is chosen", async () => {
    const models = await fetchProviderModels("anthropic")
    expect((models as any[]).filter((model) => model.recommended).map((model) => model.id)).toEqual(["claude-haiku-5-5"])
})

it("takes that one as the default in the settings", () => {
    const options = readFileSync(new URL("../../../frontend/ai/components/popups/LlmOptions.svelte", import.meta.url), "utf8")
    expect(options).toContain("activeModelList.find((model) => model.recommended)")
})
