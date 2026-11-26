// No call leaves the computer: axios is mocked, so nothing here spends a request.
import { beforeEach, expect, it, vi } from "vitest"
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("axios", () => ({ default: { get, post } }))
import { anthropicProvider } from "./anthropic"

beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: {} })
    post.mockReset().mockResolvedValue({ data: { content: [{ type: "text", text: "ok" }] } })
})

const schema = { type: "object" }

it("asks the cheap model at low effort, with the system prompt cached", async () => {
    expect(await anthropicProvider.complete("key", "", { systemPrompt: "rules", prompt: "hi", jsonSchema: schema })).toBe("ok")
    expect(post.mock.calls[0][1]).toEqual({
        model: "claude-haiku-5-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hi" }],
        system: [{ type: "text", text: "rules", cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low", format: { type: "json_schema", schema } }
    })
})

it.each(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1-20250805", "claude-sonnet-4-20250514"])("sends no effort to %s, which refuses it", async (model) => {
    await anthropicProvider.complete("key", model, { prompt: "hi" })
    expect(post.mock.calls[0][1].output_config).toBeUndefined()
})

it.each(["claude-sonnet-5-5", "claude-opus-4-5-20251101", "claude-sonnet-4-6", "claude-opus-5-5"])("sends low effort to %s", async (model) => {
    await anthropicProvider.complete("key", model, { prompt: "hi" })
    expect(post.mock.calls[0][1].output_config).toEqual({ effort: "low" })
})

it("checks a key by looking the model up, which costs nothing", async () => {
    expect(await anthropicProvider.testConnection("key", "")).toEqual({ ok: true })
    expect(get.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/models/claude-haiku-5-5")
    expect(post).not.toHaveBeenCalled()
})

it.each([
    [401, /not accepted/],
    [403, /not allowed/],
    [404, /cannot use that model/],
    [429, /no credit/],
    [529, /not answering/],
    [undefined, /internet connection/]
])("says what is wrong with a key in plain words (%s)", async (status, words) => {
    get.mockRejectedValue(status ? { response: { status, data: { error: { message: "invalid x-api-key" } } } } : { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.anthropic.com" })
    const result = await anthropicProvider.testConnection("key", "")
    expect(result).toEqual({ ok: false, error: expect.stringMatching(words) })
})
