import axios from "axios"
import type { LLMCompletionOptions } from "../../../../types/ai/Ai"

export const LLM_API_TIMEOUT = 45000

export interface ModelOption {
    id: string
    name: string
    recommended?: boolean
}

export function buildMessages(options: LLMCompletionOptions): any[] {
    const messages: any[] = []
    if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt })
    messages.push({ role: "user", content: options.prompt })
    return messages
}

export abstract class APIModel {
    readonly REQUEST_TIMEOUT: number = LLM_API_TIMEOUT
    abstract readonly id: string
    abstract fallbackModel: string

    abstract fetchModels(apiKey: string): Promise<ModelOption[]>
    abstract testConnection(apiKey: string, model: string): Promise<{ ok: true } | { ok: false; error: string }>
    abstract complete(apiKey: string, model: string, options: LLMCompletionOptions): Promise<string>

    protected toLLMError(err: unknown): Error {
        if (err instanceof Error) return err

        const e = err as any
        if (["ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED"].includes(e?.code)) {
            return new Error(e.message || "Request timed out")
        }

        const status = e?.response?.status
        if (typeof status === "number") {
            const errorData = e?.response?.data?.error
            const message = typeof errorData === "string" ? errorData : errorData?.message || e?.response?.data?.message
            if (message) return new Error(message)

            if (status === 401) return new Error("Invalid API key")
            if (status === 403) return new Error("Access forbidden")
            if (status === 404) return new Error("Model not found")
            if (status === 429) return new Error("Rate limit exceeded")
            if (status >= 500) return new Error("Server error")
            return new Error(`HTTP ${status}`)
        }

        return new Error(e?.message || "Network error")
    }

    /** what is wrong with a key, in words the person typing it can act on: the provider's own text is not shown */
    private keyProblem(err: unknown): string {
        const status = (err as any)?.response?.status
        if (status === 401) return "That key was not accepted. Check that you copied all of it."
        if (status === 403) return "This key is not allowed to do this. Check the account that made it."
        if (status === 404) return "This key cannot use that model. Choose another model."
        if (status === 429) return "Too many requests, or the account has no credit left. Try again in a few minutes."
        if (typeof status === "number") return "The AI service is not answering right now. Try again in a minute."
        return "The AI service could not be reached. Check the internet connection."
    }

    protected async testEndpoint(url: string, headers: Record<string, string>, method: "GET" | "POST" = "GET", body?: any): Promise<{ ok: true } | { ok: false; error: string }> {
        try {
            const request = method === "POST" ? axios.post : axios.get
            await request(url, method === "POST" ? body : { headers, timeout: this.REQUEST_TIMEOUT }, { headers, timeout: this.REQUEST_TIMEOUT })
            return { ok: true }
        } catch (err) {
            return { ok: false, error: this.keyProblem(err) }
        }
    }
}
