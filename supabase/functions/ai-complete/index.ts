// Scriptural AI: the app's AI features for churches on a paid plan, with no
// key of their own. One request is counted per call against the church's
// monthly allowance (use_ai_request). Claude answers; Gemini if Claude fails.
// POST { churchId, prompt, systemPrompt?, jsonSchema?, maxTokens? } -> { text }
import { createClient } from "npm:@supabase/supabase-js@2"
import { callerRole, cors, failure, json } from "../_shared/church.ts"

const CLAUDE_MODEL = "claude-sonnet-5-5"
const GEMINI_MODEL = "gemini-2.5-flash"
const MAX_TOKENS = 4096
const MAX_PROMPT_CHARS = 60_000

async function claude(body: { prompt: string; systemPrompt?: string; jsonSchema?: unknown; maxTokens?: number }): Promise<string> {
    const key = Deno.env.get("ANTHROPIC_API_KEY")
    if (!key) throw new Error("no Anthropic key")
    const request: Record<string, unknown> = { model: CLAUDE_MODEL, max_tokens: Math.min(body.maxTokens || MAX_TOKENS, MAX_TOKENS), messages: [{ role: "user", content: body.prompt }] }
    if (body.systemPrompt) request.system = body.systemPrompt
    if (body.jsonSchema) request.output_config = { format: { type: "json_schema", schema: body.jsonSchema } }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(45_000)
    })
    if (!response.ok) throw new Error(`Claude ${response.status}`)
    const data = await response.json()
    if (data.stop_reason === "refusal" || data.stop_reason === "max_tokens") throw new Error(`Claude stopped: ${data.stop_reason}`)
    return data.content?.find((b: { type: string }) => b.type === "text")?.text || ""
}

async function gemini(body: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<string> {
    const key = Deno.env.get("GEMINI_API_KEY")
    if (!key) throw new Error("no Gemini key")
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_CHARS) return json({ error: "bad_request" }, 400)
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

        let text: string
        try {
            text = await claude(body)
        } catch (claudeError) {
            console.warn("Claude failed, trying Gemini:", String(claudeError))
            text = await gemini(body)
        }
        return json({ text })
    } catch (error) {
        return failure(error)
    }
})
