// Scriptural AI: the app's AI features through the church's plan, for churches
// that would rather not bring their own Claude or Gemini key. Counted against
// the plan's monthly allowance on the server.

import type { LLMCompletionOptions } from "../../types/ai/Ai"
import { churchLibrary } from "./connection"

export const ACTIVE_CHURCH_KEY = "church-library-active"

export async function completeWithScripturalAI(options: Omit<LLMCompletionOptions, "signal">): Promise<{ text: string; error?: string }> {
    const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY)
    if (!churchLibrary.getSession() || !churchId) return { text: "", error: "Sign in to your church library (Import > Church library) to use Scriptural AI." }
    try {
        const { ok, data } = await churchLibrary.invoke<{ text?: string; message?: string }>("ai-complete", { churchId, prompt: options.prompt, systemPrompt: options.systemPrompt, jsonSchema: options.jsonSchema, maxTokens: options.maxTokens })
        return ok ? { text: data.text || "" } : { text: "", error: data.message || "Scriptural AI is not available right now." }
    } catch {
        return { text: "", error: "Scriptural AI could not be reached." }
    }
}
