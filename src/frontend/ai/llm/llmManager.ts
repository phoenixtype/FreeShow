import { get, writable, type Writable } from "svelte/store"
import type { AIProviderId, MatchResult } from "../../../types/ai/Ai"
import { Main } from "../../../types/IPC/Main"
import { requestMain } from "../../IPC/main"
import { completeWithScripturalAI } from "../../scriptural/ai"
import { ai } from "../../stores"
import { getEditItems } from "../../components/edit/scripts/itemHelpers"
import { CHAT_RESPONSE_SCHEMA, CHAT_SYSTEM_PROMPT, getSlideChatSystemPrompt, SLIDE_CHAT_RESPONSE_SCHEMA, STT_CONTROLLER_PROMPT, STT_CONTROLLER_SCHEMA } from "./prompts"
import { agentInstructions, runAgentChat } from "../agent/agentChat"
import { readPassage } from "../scripture/passage"
import { closeSchema, parseReply } from "./schema"
import { fitsSchema, listenWords, modelSteps, type ModelStep } from "./routing"
import type { FreeShowAction } from "../manager/ChatAction"

export interface ChatMessage {
    id: string
    role: "user" | "assistant" | "system"
    content: string
    timestamp: number
    action?: FreeShowAction
}

export interface ChatSendOptions {
    systemPrompt?: string
    jsonSchema?: any
    onStep?: (tool: string, ok: boolean) => void
}

export const chatSessions: Writable<Record<string, ChatMessage[]>> = writable({})

interface LLMRequestOptions {
    systemPrompt?: string
    prompt: string
    jsonSchema?: any
    temperature?: number
    maxTokens?: number
    /** the model on this computer already got this request wrong: ask the stronger one first */
    struggling?: boolean
    /** skips a model this request should not be spent on */
    allow?: (step: ModelStep) => boolean
}

// someone is waiting: past this, the next model is asked
const FIRST_ANSWER_MS = 25000

let llmManager: LLMManager | null = null

export function getLLMManager(): LLMManager | null {
    const { provider = "none", model = "" } = get(ai).llm || {}
    if (provider === "none") return null

    if (llmManager && (llmManager.providerId !== provider || llmManager.model !== model)) {
        llmManager.stop()
        llmManager = null
    }

    if (!llmManager) llmManager = new LLMManager(provider as AIProviderId, model)

    return llmManager
}

export class LLMManager {
    providerId: AIProviderId
    model: string

    constructor(providerId: AIProviderId, model: string) {
        this.providerId = providerId
        this.model = model
    }

    private retryTimeout: ReturnType<typeof setTimeout> | null = null
    async request<T>(asked: LLMRequestOptions): Promise<T | null> {
        const options = asked.jsonSchema ? { ...asked, jsonSchema: closeSchema(asked.jsonSchema) } : asked
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout)
            this.retryTimeout = null
        }

        const { struggling, allow, ...completion } = options
        const steps = modelSteps({ provider: this.providerId, model: this.model, local: get(ai).llm?.localFallback, struggling })

        for (const [index, step] of steps.entries()) {
            if (allow && !allow(step)) continue
            try {
                const isLast = index === steps.length - 1
                const response = step.providerId === "scriptural" ? await completeWithScripturalAI(completion) : await requestMain(Main.AI_LLM_COMPLETE, { ...step, options: completion }, undefined, isLast ? 60000 : FIRST_ANSWER_MS)

                if (response?.error || !response?.text) {
                    if (response?.error) console.error("LLM error:", response.error)
                    continue
                }

                const reply = parseReply<T>(response.text)
                if (fitsSchema(reply, completion.jsonSchema)) return reply
                console.error("LLM error: the answer is missing fields")
            } catch (error: any) {
                console.error("LLM request failed:", error?.message || error)
            }
        }
        return null
    }

    stop() {
        if (this.retryTimeout) clearTimeout(this.retryTimeout)
        this.retryTimeout = null
    }

    // --- STT Match Detection ---

    private newWords = 0
    private newPlanWords = 0
    private requestInProgress: boolean = false
    async detectMatch(chunk: { chunkWithOverlap: string; newWordsCount: number }): Promise<MatchResult | null> {
        const { chunkWithOverlap, newWordsCount } = chunk
        if (!chunkWithOverlap) return null

        this.newWords += newWordsCount
        this.newPlanWords += newWordsCount
        if (this.requestInProgress) return null

        // asked of this step only after it has heard enough new words
        const heard = (step: ModelStep) => (step.providerId === "scriptural" ? this.newPlanWords : this.newWords) >= listenWords(step)
        const steps = modelSteps({ provider: this.providerId, model: this.model, local: get(ai).llm?.localFallback }).filter(heard)
        if (!steps.length) return null

        this.newWords = 0
        this.requestInProgress = true
        const allow = (step: ModelStep) => {
            if (!steps.some((s) => s.providerId === step.providerId)) return false
            if (step.providerId === "scriptural") this.newPlanWords = 0
            return true
        }

        try {
            const result = await this.request<MatchResult>({
                systemPrompt: STT_CONTROLLER_PROMPT,
                jsonSchema: STT_CONTROLLER_SCHEMA,
                prompt: chunkWithOverlap,
                allow
            })
            // only passages are asked for, whatever a model answers
            if (!result?.content || result.type !== "scripture") return null

            // the model's own certainty is only its word: the passage has to exist, and it is
            // offered to the operator rather than put up by itself
            const passage = await readPassage(result.content)
            return passage ? { ...result, content: passage.reference, confidence: Math.min(Number(result.confidence) || 50, 74) } : null
        } finally {
            this.requestInProgress = false
        }
    }

    // --- Chat Helper ---

    getHistory(sessionKey: string = "default"): ChatMessage[] {
        return getChatHistory(sessionKey)
    }

    clearHistory(sessionKey: string = "default"): void {
        clearChatHistory(sessionKey)
    }

    addMessage(sessionKey: string, role: ChatMessage["role"], content: string, action?: FreeShowAction): ChatMessage {
        return addChatMessage(sessionKey, role, content, action)
    }

    private readonly DEBUG_MODE = false
    async sendMessage(sessionKeyOrPrompt: string, promptOrOptions?: string | ChatSendOptions, maybeOptions?: ChatSendOptions): Promise<ChatMessage | null> {
        let sessionKey = "default"
        let prompt = ""
        let options: ChatSendOptions = {}

        if (typeof promptOrOptions === "string") {
            sessionKey = sessionKeyOrPrompt
            prompt = promptOrOptions
            options = maybeOptions || {}
        } else {
            prompt = sessionKeyOrPrompt
            options = promptOrOptions || {}
        }

        const trimmed = prompt.trim()
        if (!trimmed) return null

        if (this.DEBUG_MODE) console.log(`[CHAT:${sessionKey}] Sending message:`, trimmed)

        this.addMessage(sessionKey, "user", trimmed)

        const isSlideTarget = sessionKey.startsWith("overlay") || sessionKey.startsWith("template") || sessionKey.includes("slide")
        // no provider takes a message list, so what was said before goes in the prompt
        const history = this.getHistory(sessionKey).map(({ role, content, action }) => (role === "assistant" && action?.data?.items ? { role, content: JSON.stringify({ content, items: action.data.items }) } : { role, content }))

        let rawResponse: any = null
        if (isSlideTarget) {
            const target = sessionKey.startsWith("overlay") ? "overlay" : sessionKey.startsWith("template") ? "template" : "slide"
            rawResponse = await this.request<any>({
                systemPrompt: options.systemPrompt || getSlideChatSystemPrompt(target, getEditItems()),
                jsonSchema: options.jsonSchema || SLIDE_CHAT_RESPONSE_SCHEMA,
                prompt: history
                    .slice(-8)
                    .map(({ role, content }) => `${role === "user" ? "User" : "Assistant"}: ${content}`)
                    .join("\n\n")
            })
        } else {
            const systemPrompt = (options.systemPrompt || CHAT_SYSTEM_PROMPT) + agentInstructions()
            rawResponse = await runAgentChat(history, {
                ask: (agentPrompt, struggling) => this.request<any>({ systemPrompt, jsonSchema: options.jsonSchema || CHAT_RESPONSE_SCHEMA, prompt: agentPrompt, struggling }),
                onStep: options.onStep
            })
        }

        if (!rawResponse) return null

        let content = rawResponse.content || rawResponse.text || rawResponse.response || ""
        content = content.replace(/\s*content\s*$/i, "").trim()

        let action: FreeShowAction | undefined = rawResponse.action?.type && rawResponse.action?.data ? (rawResponse.action as FreeShowAction) : undefined

        if (!action && Array.isArray(rawResponse.items) && rawResponse.items.length > 0) {
            action = {
                type: "APPLY_TO_SLIDE",
                data: {
                    items: rawResponse.items
                }
            }
        }

        if (!content) {
            content = action ? `Apply changes to ${sessionKey.startsWith("overlay") ? "overlay" : sessionKey.startsWith("template") ? "template" : "slide"}?` : "Incorrect response format received. Try again!"
        }

        return this.addMessage(sessionKey, "assistant", content, action)
    }
}

// CHAT

export function getChatHistory(sessionKey: string = "default"): ChatMessage[] {
    return get(chatSessions)[sessionKey] || []
}

export function clearChatHistory(sessionKey: string = "default"): void {
    chatSessions.update((sessions) => {
        delete sessions[sessionKey]
        return sessions
    })
}

export function addChatMessage(sessionKey: string, role: ChatMessage["role"], content: string, action?: FreeShowAction): ChatMessage {
    const message: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: Date.now(),
        ...(action ? { action } : {})
    }

    chatSessions.update((sessions) => {
        const history = sessions[sessionKey] || []
        return { ...sessions, [sessionKey]: [...history, message] }
    })

    return message
}
