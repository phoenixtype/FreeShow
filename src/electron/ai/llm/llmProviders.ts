import type { AIProviderId } from "../../../types/ai/Ai"
import { getAiKey } from "../setup/aiKeys"
import { anthropicProvider } from "./providers/anthropic"
import { googleProvider } from "./providers/google"
import { ollamaProvider } from "./providers/ollama"
import { openaiProvider } from "./providers/openai"

export const llmProviders = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
    google: googleProvider,
    ollama: ollamaProvider
}

// "scriptural" is answered in the app through the church library, never here
type LocalProviderId = Exclude<AIProviderId, "scriptural">

export function getLLMProvider(id: AIProviderId) {
    return llmProviders[id as LocalProviderId]
}

function resolveApiKey(providerId: AIProviderId) {
    const key = getAiKey(providerId)
    if (!key && providerId !== "ollama") throw new Error("Missing API key")
    return key
}

// calls still out, so one that nobody is waiting for any more can be ended
const running = new Map<string, AbortController>()

export function cancelLLM(requestId: string) {
    running.get(requestId)?.abort()
}

export async function completeLLM(data: { providerId: AIProviderId; model: string; options: { systemPrompt?: string; prompt: string; jsonSchema?: any; temperature?: number; maxTokens?: number }; requestId?: string }): Promise<{ text: string; error?: string }> {
    const controller = new AbortController()
    if (data.requestId) running.set(data.requestId, controller)
    try {
        if (data.providerId === "scriptural") throw new Error("Scriptural AI is answered in the app")
        const key = resolveApiKey(data.providerId)
        const text = await llmProviders[data.providerId as LocalProviderId].complete(key, data.model, { ...data.options, signal: controller.signal })
        return { text }
    } catch (err: any) {
        return { text: "", error: err?.message }
    } finally {
        if (data.requestId) running.delete(data.requestId)
    }
}

export async function fetchProviderModels(providerId: AIProviderId) {
    try {
        if (providerId === "scriptural") return []
        const key = resolveApiKey(providerId)
        const provider = llmProviders[providerId as LocalProviderId]
        // the one a request uses when none is chosen: cheap and quick enough for a service
        return (await provider.fetchModels(key)).map((model) => ({ ...model, recommended: model.id === provider.fallbackModel }))
    } catch (err: any) {
        return { text: "", error: err?.message }
    }
}
