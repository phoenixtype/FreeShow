import { expect, it } from "vitest"
import { closeSchema, parseReply } from "./schema"

it("closes every object, nullable ones too", () => {
    const closed = closeSchema({ type: "object", properties: { a: { type: ["object", "null"], properties: { b: { type: "array", minItems: 1, items: { type: "object", properties: {} } } } } } })
    expect(closed.additionalProperties).toBe(false)
    expect(closed.properties.a.additionalProperties).toBe(false)
    expect(closed.properties.a.properties.b).toEqual({ type: "array", items: { type: "object", properties: {}, additionalProperties: false } })
})

it("reads JSON with or without a code fence", () => {
    expect(parseReply('{"a":1}')).toEqual({ a: 1 })
    expect(parseReply('```json\n{"a":1}\n```')).toEqual({ a: 1 })
})
