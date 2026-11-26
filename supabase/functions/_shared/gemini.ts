// The pure parts of the Gemini fallback, so they can be tested without a call.

// gemini-3.5-flash-lite, in
// millionths of a dollar per token; thinking is billed as output
const PRICE = { input: 0.3, output: 2.5, cached: 0.03 }

/** generationConfig: the same JSON shape Claude was asked for */
export const geminiConfig = (jsonSchema: unknown, maxOutputTokens: number) => ({ maxOutputTokens, ...(jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: jsonSchema } : {}) })

export interface GeminiUsage {
    promptTokenCount?: number
    cachedContentTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
}

/** what one answer cost, in micros */
export function geminiMicros(usage: GeminiUsage | undefined): number {
    const cached = usage?.cachedContentTokenCount || 0
    const input = Math.max((usage?.promptTokenCount || 0) - cached, 0)
    const output = (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0)
    return Math.ceil(input * PRICE.input + cached * PRICE.cached + output * PRICE.output)
}

/** the app can use it: some text, and JSON when JSON was asked for (a code fence around it is fine) */
export function usableAnswer(text: string, wantsJson: boolean): boolean {
    if (!text.trim()) return false
    if (!wantsJson) return true
    const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text)
    try {
        JSON.parse(fenced ? fenced[1] : text)
        return true
    } catch {
        return false
    }
}
