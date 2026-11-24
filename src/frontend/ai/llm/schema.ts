// Claude refuses a schema with an object left open to other keys, and OpenAI does too
// in strict mode. The schemas are written short; this closes every object in them.

export function closeSchema(schema: any): any {
    if (Array.isArray(schema)) return schema.map(closeSchema)
    if (!schema || typeof schema !== "object") return schema
    const closed = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, closeSchema(value)]))
    const isObject = schema.type === "object" || (Array.isArray(schema.type) && schema.type.includes("object"))
    if (isObject && schema.properties && closed.additionalProperties === undefined) closed.additionalProperties = false
    // not supported by every provider, and never relied on
    if (schema.type) for (const key of ["minItems", "minimum", "maximum"]) delete closed[key]
    return closed
}

/** local models like to wrap their JSON in a code fence */
export function parseReply<T>(text: string): T {
    const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text)
    return JSON.parse(fenced ? fenced[1] : text) as T
}
