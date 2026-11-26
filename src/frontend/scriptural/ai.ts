// Scriptural AI: the app's AI features through the church's plan, for churches
// that would rather not bring their own Claude or Gemini key. Counted against
// the plan's monthly allowance on the server.

import type { LLMCompletionOptions } from "../../types/ai/Ai"
import type { AiTask } from "../ai/llm/routing"
import { churchLibrary } from "./connection"
import { planNotice, planProblem } from "./planNotice"

export const ACTIVE_CHURCH_KEY = "church-library-active"

const SIGN_IN = "Sign in to your church library (Import > Church library) to use Scriptural AI."
const NOT_ANSWERING = "Scriptural AI is not answering right now. Try again in a minute."
const OWN_KEY = "or add your own Claude or Gemini key in Settings, Live Copilot."

/** the server's refusal in words a volunteer can act on; its own text is never shown */
function refusal(status: number, code: string): string {
    if (status === 402) return code === "allowance_used" ? `This month's Scriptural AI is used up. Upgrade your plan, ${OWN_KEY}` : `Scriptural AI comes with a Church plan. Choose a plan, ${OWN_KEY}`
    if (status === 401) return SIGN_IN
    if (status === 403) return "Scriptural AI is for owners, admins and editors of this church. Ask an admin to change your role."
    if (status === 429) return "That is a lot of requests at once. Wait a minute and try again."
    if (status === 400) return "That request was too long. Ask for less at once."
    return NOT_ANSWERING
}

let noticed = false

export async function completeWithScripturalAI(options: Omit<LLMCompletionOptions, "signal">, task: AiTask = "ask"): Promise<{ text: string; error?: string; status?: number }> {
    const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY)
    if (!churchLibrary.getSession() || !churchId) return { text: "", error: SIGN_IN }
    try {
        const { ok, status, data } = await churchLibrary.invoke<{ text?: string; error?: string }>("ai-complete", { churchId, prompt: options.prompt, systemPrompt: options.systemPrompt, jsonSchema: options.jsonSchema, maxTokens: options.maxTokens, task })
        if (ok) {
            planProblem.set("")
            planNotice.set("")
            return { text: data.text || "" }
        }

        const error = refusal(status, data.error || "")
        if (status === 402) {
            planProblem.set(error)
            if (!noticed) {
                noticed = true
                planNotice.set(error)
                // only here: downloads read this file too, without the app around it
                const { newToast } = await import("../utils/common")
                newToast(error)
            }
        }
        return { text: "", error, status }
    } catch {
        return { text: "", error: "Scriptural AI could not be reached. Check the internet connection." }
    }
}
