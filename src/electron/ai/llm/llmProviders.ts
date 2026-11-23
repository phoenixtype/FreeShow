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

export async function completeLLM(data: { providerId: AIProviderId; model: string; options: { systemPrompt?: string; prompt: string; jsonSchema?: any; temperature?: number; maxTokens?: number } }): Promise<{ text: string; error?: string; code?: string; retryAfter?: number }> {
    try {
        if (data.providerId === "scriptural") throw new Error("Scriptural AI is answered in the app")
        const key = resolveApiKey(data.providerId)
        const text = await llmProviders[data.providerId as LocalProviderId].complete(key, data.model, data.options)
        return { text }
    } catch (err: any) {
        return { text: "", error: err?.message, retryAfter: err?.retryAfter }
    }
}

export function fetchProviderModels(providerId: AIProviderId) {
    try {
        if (providerId === "scriptural") return []
        const key = resolveApiKey(providerId)
        return llmProviders[providerId as LocalProviderId].fetchModels(key)
    } catch (err: any) {
        return { text: "", error: err?.message }
    }
}
