import type { AiSettings } from "../../../types/ai/AiSettings"

/** Whether what is heard may be sent to AI (meaning search, then the model). Off unless the
 * operator switched it on, or chose agent mode, which says it uses AI requests. */
export const usesAiDetection = (settings: AiSettings | undefined): boolean => !!(settings?.llm?.detect || settings?.matthias?.agentMode)
