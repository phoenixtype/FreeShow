export interface AiSettings {
    enabled?: boolean
    stt?: SttSettings
    llm?: LlmSettings

    matthias?: MatthiasSettings

    scripture?: AiScriptureSettings
    lyrics?: AiScriptureSettings
}

interface MatthiasSettings {
    name?: boolean // answers to its name (on unless switched off)
    agentMode?: boolean // leads the screen by itself
    clearAfter?: number // minutes a finished passage stays up in agent mode, 0 = until cleared
}

interface SttSettings {
    // enabled?: boolean
    micDeviceId?: string

    engine?: string
    // per-engine options
    engineOptions?: {
        [key: string]: SttEngineOptions
    }
}

export interface SttEngineOptions {
    customPath?: string

    language?: string // transcription language
    model?: string
    customModelPath?: string

    // WIP interpretationMode
    interpretationMode?: boolean
    listenLanguage?: string
    spokenLanguages?: string[]
}

interface LlmSettings {
    provider?: string
    model?: string
    // a local Ollama model: first with Scriptural AI, the backup with any other provider (see routing.ts)
    localFallback?: string
}

export type ConfidenceLevels = "ask" | "highest" | "high" | "medium"
interface AiScriptureSettings {
    confidence?: ConfidenceLevels
}
