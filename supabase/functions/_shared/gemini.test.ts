// deno test supabase/functions/_shared/gemini.test.ts (no network, no model call)
import { geminiConfig, geminiMicros, usableAnswer } from "./gemini.ts"

function equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

Deno.test("the fallback is asked for JSON in the same shape", () => {
    const schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false }
    equal(geminiConfig(schema, 100), { maxOutputTokens: 100, responseMimeType: "application/json", responseJsonSchema: schema })
    equal(geminiConfig(undefined, 100), { maxOutputTokens: 100 })
})

Deno.test("what the fallback costs is counted, thinking included", () => {
    equal(geminiMicros({ promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 100 }), 800)
    equal(geminiMicros({ promptTokenCount: 1000, cachedContentTokenCount: 1000 }), 30)
    equal(geminiMicros(undefined), 0)
})

Deno.test("an empty or half-written answer is not an answer", () => {
    equal(usableAnswer("", false), false)
    equal(usableAnswer("  ", false), false)
    equal(usableAnswer("hello", false), true)
    equal(usableAnswer("hello", true), false)
    equal(usableAnswer('{"a":', true), false)
    equal(usableAnswer('{"a":1}', true), true)
    equal(usableAnswer('```json\n{"a":1}\n```', true), true)
})
