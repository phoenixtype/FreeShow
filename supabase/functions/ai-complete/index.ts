// Scriptural AI: the app's AI features for churches on a paid plan, with no
// key of their own. One request is counted per call against the church's
// monthly allowance (use_ai_request). Claude answers; Gemini if Claude fails.
// POST { churchId, prompt, systemPrompt?, jsonSchema?, maxTokens? } -> { text }
import { createClient } from "npm:@supabase/supabase-js@2"
import { admin, callerRole, cors, failure, json } from "../_shared/church.ts"

const CLAUDE_MODEL = "claude-sonnet-5-5"
const GEMINI_MODEL = "gemini-2.5-flash"
const MAX_TOKENS = 4096
// Claude thinks before it answers, and its thinking comes out of max_tokens. At low effort
// it is brief, and Claude always gets the whole cap, however short an answer was asked for.
const CLAUDE_EFFORT = "low"
// Sonnet 5.5, in millionths of a dollar per token; a cache write costs a quarter more than input
const PRICE = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 }
const MAX_PROMPT_CHARS = 60_000

async function claude(body: { prompt: string; systemPrompt?: string; jsonSchema?: unknown; maxTokens?: number }, spent: (micros: number) => void): Promise<string> {
    const key = Deno.env.get("ANTHROPIC_API_KEY")
    if (!key) throw new Error("no Anthropic key")
    const outputConfig = { effort: CLAUDE_EFFORT, ...(body.jsonSchema ? { format: { type: "json_schema", schema: body.jsonSchema } } : {}) }
    const request: Record<string, unknown> = { model: CLAUDE_MODEL, max_tokens: MAX_TOKENS, output_config: outputConfig, messages: [{ role: "user", content: body.prompt }] }
    // the same for every step of an agent turn, so it is paid for in full only once
    if (body.systemPrompt) request.system = [{ type: "text", text: body.systemPrompt, cache_control: { type: "ephemeral" } }]
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(45_000)
    })
    if (!response.ok) throw new Error(`Claude ${response.status}`)
    const data = await response.json()
    const usage = data.usage || {}
    spent(Math.ceil((usage.input_tokens || 0) * PRICE.input + (usage.output_tokens || 0) * PRICE.output + (usage.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (usage.cache_read_input_tokens || 0) * PRICE.cacheRead))
    if (data.stop_reason === "refusal" || data.stop_reason === "max_tokens") throw new Error(`Claude stopped: ${data.stop_reason}`)
    return data.content?.find((b: { type: string }) => b.type === "text")?.text || ""
}

async function gemini(body: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<string> {
    const key = Deno.env.get("GEMINI_API_KEY")
    if (!key) throw new Error("no Gemini key")
    // the key goes in a header: a URL ends up in error messages and logs
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: body.prompt }] }], ...(body.systemPrompt ? { systemInstruction: { parts: [{ text: body.systemPrompt }] } } : {}), generationConfig: { maxOutputTokens: Math.min(body.maxTokens || MAX_TOKENS, MAX_TOKENS) } }),
        signal: AbortSignal.timeout(45_000)
    })
    if (!response.ok) throw new Error(`Gemini ${response.status}`)
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || ""
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    try {
        const body = await req.json().catch(() => ({}))
        if (typeof body.prompt !== "string" || !body.prompt.trim()) return json({ error: "bad_request" }, 400)
        // one request is one request: the system prompt and schema share the prompt's budget
        const size = body.prompt.length + (typeof body.systemPrompt === "string" ? body.systemPrompt.length : 0) + (body.jsonSchema ? JSON.stringify(body.jsonSchema).length : 0)
        if (size > MAX_PROMPT_CHARS) return json({ error: "bad_request", message: "That request is too long." }, 400)
        if (body.systemPrompt !== undefined && typeof body.systemPrompt !== "string") return json({ error: "bad_request" }, 400)
        if (body.maxTokens !== undefined && !(Number.isInteger(body.maxTokens) && body.maxTokens > 0)) return json({ error: "bad_request" }, 400)
        const caller = await callerRole(req, String(body.churchId || ""))
        if (!caller) return json({ error: "unauthorized" }, 401)

        // counted as the caller, so the database checks membership itself
        const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false } })
        const { data: allowed, error } = await userDb.rpc("use_ai_request", { target: body.churchId })
        if (error) throw error
        if (!allowed) {
            const { data: limits } = await userDb.rpc("church_limits", { target: body.churchId }).single()
            const free = (limits as { plan?: string } | null)?.plan === "free"
            const message = free ? "Scriptural AI comes with a Church plan. Or add your own Claude or Gemini key in Settings." : "This month's Scriptural AI is used up. Upgrade, or add your own Claude or Gemini key in Settings."
            return json({ error: free ? "plan_required" : "allowance_used", message }, 402)
        }

        // only the server settles a request: a member could hand their own back
        let cost = 0
        const settle = async (answered: boolean) => {
            const { error: settleError } = await admin().rpc("settle_ai_request", { target: body.churchId, cost, answered })
            if (settleError) console.error("Could not settle an AI request:", settleError.message)
        }

        let text: string
        try {
            text = await claude(body, (micros) => (cost += micros))
        } catch (claudeError) {
            console.warn("Claude failed, trying Gemini:", String(claudeError))
            try {
                text = await gemini(body)
            } catch (geminiError) {
                // neither answered: the church is not charged for it
                await settle(false)
                console.error("Gemini failed too:", String(geminiError))
                return json({ error: "ai_unavailable", message: "Scriptural AI is not answering right now. Try again in a minute." }, 503)
            }
        }
        await settle(true)
        return json({ text })
    } catch (error) {
        return failure(error)
    }
})
