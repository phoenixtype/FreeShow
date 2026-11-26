import { beforeEach, describe, expect, it, vi } from "vitest"

const stored: { secrets: any } = { secrets: {} }
const testConnection = vi.fn()
let available = true

vi.mock("electron", () => ({
    safeStorage: {
        isEncryptionAvailable: () => available,
        encryptString: (text: string) => Buffer.from([...text].reverse().join("")),
        decryptString: (buffer: Buffer) => [...buffer.toString()].reverse().join("")
    }
}))
vi.mock("../../data/store", () => ({ getStoreValue: () => stored.secrets, setStoreValue: ({ value }: any) => (stored.secrets = value) }))
vi.mock("../llm/llmProviders", () => ({ getLLMProvider: () => ({ testConnection }) }))

const { getAiKey, setAiKey } = await import("./aiKeys")

const onDisk = () => JSON.stringify(stored.secrets)

beforeEach(() => {
    stored.secrets = {}
    available = true
    testConnection.mockReset().mockResolvedValue({ ok: true })
})

describe("AI keys", () => {
    it("are encrypted on disk", async () => {
        await setAiKey({ providerId: "anthropic", key: "sk-test-123" })
        expect(onDisk()).not.toContain("sk-test-123")
        expect(getAiKey("anthropic")).toBe("sk-test-123")
    })

    it("saved before encryption are encrypted the first time they are read", () => {
        stored.secrets = { canvaClientId: "kept", aiProviders: { google: "old-plain-key" } }
        expect(getAiKey("google")).toBe("old-plain-key")
        expect(onDisk()).not.toContain("old-plain-key")
        expect(stored.secrets.canvaClientId).toBe("kept")
        expect(getAiKey("google")).toBe("old-plain-key")
    })

    it("are removed by saving an empty one, without calling the provider", async () => {
        stored.secrets = { aiProviders: { openai: "k" } }
        expect(await setAiKey({ providerId: "openai", key: "" })).toBe(true)
        expect(getAiKey("openai")).toBe("")
        expect(testConnection).not.toHaveBeenCalled()
    })

    it("still work where the computer cannot encrypt", async () => {
        available = false
        await setAiKey({ providerId: "anthropic", key: "plain" })
        expect(getAiKey("anthropic")).toBe("plain")
    })
})
