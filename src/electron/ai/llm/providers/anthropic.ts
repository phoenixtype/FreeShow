import axios from "axios"
import type { LLMCompletionOptions } from "../../../../types/ai/Ai"
import { APIModel, type ModelOption } from "./APIProvider"

const API_URL = "https://api.anthropic.com/v1/messages"
const MODELS_URL = "https://api.anthropic.com/v1/models"
// the models that accept an effort setting; Haiku 4.5, Sonnet 4.5 and older answer 400 to it
const TAKES_EFFORT = /^claude-(?:fable-|mythos-|opus-(?:4-[5-9]\b|[5-9])|sonnet-(?:4-6|[5-9])|haiku-[5-9])/

class AnthropicProvider extends APIModel {
    readonly id = "anthropic"
    readonly fallbackModel = "claude-haiku-5-5"

    private getHeaders(apiKey: string) {
        return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }
    }

    async fetchModels(apiKey: string): Promise<ModelOption[]> {
        if (!apiKey) return []
        try {
            const { data } = await axios.get(MODELS_URL, {
                headers: this.getHeaders(apiKey),
                timeout: this.REQUEST_TIMEOUT
            })
            const list = Array.isArray(data?.data) ? data.data : []
            return list.map((m: any) => ({
                id: m.id,
                name: m.display_name || m.id
            }))
        } catch {
            return []
        }
    }

    // looking a model up proves the key and costs nothing
    async testConnection(apiKey: string, model: string) {
        return this.testEndpoint(`${MODELS_URL}/${encodeURIComponent(model || this.fallbackModel)}`, this.getHeaders(apiKey), "GET")
    }

    async complete(apiKey: string, model: string, options: LLMCompletionOptions): Promise<string> {
        const body: any = {
            model: model || this.fallbackModel,
            max_tokens: options.maxTokens ?? 4096,
            messages: [{ role: "user", content: options.prompt }]
        }
        // the same for every question about a sermon and every step of a turn, so it is cached
        if (options.systemPrompt) body.system = [{ type: "text", text: options.systemPrompt, cache_control: { type: "ephemeral" } }]
        // these are short, plain answers someone is waiting for
        const outputConfig = { ...(TAKES_EFFORT.test(body.model) ? { effort: "low" } : {}), ...(options.jsonSchema ? { format: { type: "json_schema", schema: options.jsonSchema } } : {}) }
        if (Object.keys(outputConfig).length) body.output_config = outputConfig

        try {
            const { data } = await axios.post(API_URL, body, {
                headers: this.getHeaders(apiKey),
                timeout: this.REQUEST_TIMEOUT,
                signal: options.signal
            })

            if (data?.stop_reason === "refusal") throw new Error("Request was refused by the model")
            if (data?.stop_reason === "max_tokens") throw new Error("Response was cut off at the token limit")

            const textBlock = Array.isArray(data?.content) ? data.content.find((block: any) => block?.type === "text") : undefined
            return textBlock?.text || ""
        } catch (err) {
            throw this.toLLMError(err)
        }
    }
}

export const anthropicProvider = new AnthropicProvider()
