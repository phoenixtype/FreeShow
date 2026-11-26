// Which model answers. A church on a plan uses a free model on its own computer first and
// Claude, through Scriptural AI, only when that one cannot give a usable answer. A church
// with its own key chose that model, so it goes first and the local one is the backup.

import type { AIProviderId } from "../../../types/ai/Ai"

/** "listen" runs all through a sermon; "ask" is someone waiting for an answer. Scriptural AI is told which. */
export type AiTask = "listen" | "ask"

export interface ModelStep {
    providerId: AIProviderId
    model: string
}

export interface RouteRequest {
    provider: AIProviderId
    model: string
    /** the Ollama model chosen for this computer */
    local?: string
    /** the local model has already got this request wrong */
    struggling?: boolean
}

export function modelSteps({ provider, model, local, struggling }: RouteRequest): ModelStep[] {
    const main: ModelStep = { providerId: provider, model }
    if (provider === "ollama" || !local) return [main]
    const onComputer: ModelStep = { providerId: "ollama", model: local }
    if (provider !== "scriptural") return [main, onComputer]
    // still the backup once it has struggled: offline, it is the only one there is
    return struggling ? [main, onComputer] : [onComputer, main]
}

// Words heard between two questions about the same sermon. On this computer they cost
// nothing. Through the plan, 15 words is about 390 requests a sermon, which would use up a
// month's 1,000 in three Sundays; 60 is under 100.
const LISTEN_WORDS = 15
const LISTEN_WORDS_PLAN = 60

export function listenWords(step: ModelStep): number {
    return step.providerId === "scriptural" ? LISTEN_WORDS_PLAN : LISTEN_WORDS
}

/** has everything the schema requires, at the top level: a small model often leaves fields out */
export function fitsSchema(value: unknown, schema: any): boolean {
    if (!schema?.properties) return value !== null && value !== undefined
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    return (schema.required || []).every((key: string) => (value as Record<string, unknown>)[key] !== undefined)
}
