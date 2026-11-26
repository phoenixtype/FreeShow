import type { AIProviderId } from "../../../types/ai/Ai"
import { getStoreValue, setStoreValue } from "../../data/store"
import { canSeal, isSealed, seal, unseal } from "../../utils/secretStore"
import { getLLMProvider } from "../llm/llmProviders"

const readSecrets = () => getStoreValue({ file: "ACCESS", key: "secrets" }) || {}

// "" removes the key
function keepKey(providerId: AIProviderId, key: string) {
    const secrets = readSecrets()
    const aiProviders = { ...(secrets.aiProviders || {}) }

    if (key) aiProviders[providerId] = seal(key)
    else delete aiProviders[providerId]

    setStoreValue({ file: "ACCESS", key: "secrets", value: { ...secrets, aiProviders } })
}

export function getAiKey(providerId: AIProviderId): string {
    const stored: string = readSecrets().aiProviders?.[providerId] || ""
    // saved before keys were encrypted
    if (stored && !isSealed(stored) && canSeal()) keepKey(providerId, stored)
    return unseal(stored)
}

export async function setAiKey(data: { providerId: AIProviderId; key: string }) {
    // test key before saving it; removing one needs no test
    if (data.key) {
        const result = await getLLMProvider(data.providerId).testConnection(data.key, "")
        if ("error" in result) return false
    }

    keepKey(data.providerId, data.key)
    return true
}
