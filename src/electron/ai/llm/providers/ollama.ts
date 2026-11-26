import axios from "axios"
import type { LLMCompletionOptions } from "../../../../types/ai/Ai"
import { APIModel, buildMessages, type ModelOption } from "./APIProvider"

const API_URL = "http://127.0.0.1:11434"

class OllamaProvider extends APIModel {
    readonly id = "ollama"
    readonly fallbackModel = "gemma3:4b"

    async fetchModels(): Promise<ModelOption[]> {
        try {
            const { data } = await axios.get(`${API_URL}/api/tags`, { timeout: 10000 })
            const models = Array.isArray(data?.models) ? data.models : []
            return models.map((m: any) => ({ id: m.name, name: m.name }))
        } catch {
            return []
        }
    }

    // is the free Ollama app running here, and which models has it downloaded
    async status(): Promise<{ running: boolean; models: string[] }> {
        try {
            const { data } = await axios.get(`${API_URL}/api/tags`, { timeout: 3000 })
            const models = Array.isArray(data?.models) ? data.models.map((m: any) => String(m.name)) : []
            return { running: true, models }
        } catch {
            return { running: false, models: [] }
        }
    }

    // downloads a model through Ollama, reporting progress as it streams in
    async pull(model: string, onProgress: (percent: number) => void): Promise<{ ok: boolean; error?: string }> {
        try {
            const response = await axios.post(`${API_URL}/api/pull`, { model, stream: true }, { responseType: "stream", timeout: 0 })
            return await new Promise((resolve) => {
                let buffer = ""
                let failed = ""
                let lastPercent = -1
                response.data.on("data", (chunk: Buffer) => {
                    buffer += chunk.toString()
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""
                    for (const line of lines) {
                        if (!line.trim()) continue
                        try {
                            const event = JSON.parse(line)
                            if (event.error) failed = String(event.error)
                            if (event.total && event.completed) {
                                const percent = Math.floor((event.completed / event.total) * 100)
                                if (percent !== lastPercent) onProgress((lastPercent = percent))
                            }
                        } catch {
                            // a partial line; the next chunk completes it
                        }
                    }
                })
                response.data.on("end", () => resolve(failed ? { ok: false, error: failed } : { ok: true }))
                response.data.on("error", (err: Error) => resolve({ ok: false, error: err.message }))
            })
        } catch {
            return { ok: false, error: "Ollama is not running on this computer" }
        }
    }

    async testConnection(_apiKey: string, model: string) {
        try {
            const models = await this.fetchModels()
            const base = model.split(":")[0]
            const found = models.some((entry) => entry.id === model || entry.id.split(":")[0] === base)

            return found ? { ok: true as const } : { ok: false as const, error: "That model is not downloaded on this computer yet." }
        } catch {
            return { ok: false as const, error: "Ollama is not running on this computer. Open it and try again." }
        }
    }

    async complete(_apiKey: string, model: string, options: LLMCompletionOptions): Promise<string> {
        const body: any = {
            model: model || this.fallbackModel,
            stream: false,
            options: { temperature: options.temperature ?? 0, num_predict: options.maxTokens ?? 1024 },
            messages: buildMessages(options)
        }
        if (options.jsonSchema) body.format = options.jsonSchema

        try {
            const { data } = await axios.post(`${API_URL}/api/chat`, body, { timeout: 30000, signal: options.signal })
            return data?.message?.content || ""
        } catch (err) {
            throw this.toLLMError(err)
        }
    }
}

export const ollamaProvider = new OllamaProvider()
