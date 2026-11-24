import { describe, expect, it, vi } from "vitest"
import { handleMcpMessage, refuseRequest, type McpApp } from "./mcpProtocol"

const app: McpApp = {
    version: "1.2.3",
    tools: async () => [{ name: "get_live_state", description: "x", inputSchema: { type: "object", properties: {} }, readOnly: true }],
    call: vi.fn(async (name) => ({ content: [{ type: "text" as const, text: name }] }))
}
const ask = (method: string, params?: any, id: any = 1) => handleMcpMessage({ jsonrpc: "2.0", id, method, params }, app)

describe("handleMcpMessage", () => {
    it("agrees on a protocol version", async () => {
        expect((await ask("initialize", { protocolVersion: "2025-03-26" })).result.protocolVersion).toBe("2025-03-26")
        expect((await ask("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-11-25")
    })
    it("lists and calls tools", async () => {
        expect((await ask("tools/list")).result.tools[0]).toMatchObject({ name: "get_live_state", annotations: { readOnlyHint: true } })
        expect((await ask("tools/call", { name: "get_live_state" })).result.content[0].text).toBe("get_live_state")
    })
    it("answers notifications with nothing, and bad requests with an error", async () => {
        expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, app)).toBeNull()
        expect((await ask("tools/call", {})).error.code).toBe(-32602)
        expect((await ask("nothing/here")).error.code).toBe(-32601)
        expect((await handleMcpMessage("hello", app)).error.code).toBe(-32600)
    })
    it("hides an internal failure", async () => {
        vi.spyOn(console, "error").mockImplementationOnce(() => undefined)
        const broken = { ...app, call: async () => Promise.reject(new Error("/Users/secret")) }
        const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "x" } }, broken)
        expect(JSON.stringify(reply)).not.toContain("secret")
    })
})

describe("refuseRequest", () => {
    const good = { host: "127.0.0.1:5507", authorization: "Bearer abc" }
    it("lets this computer in with the token", () => expect(refuseRequest(good, 5507, "abc")).toBeNull())
    it("refuses a wrong, missing or unset token", () => {
        expect(refuseRequest({ ...good, authorization: "Bearer no" }, 5507, "abc")?.status).toBe(401)
        expect(refuseRequest({ host: good.host }, 5507, "abc")?.status).toBe(401)
        expect(refuseRequest({ ...good, authorization: "Bearer " }, 5507, "")?.status).toBe(401)
    })
    it("refuses web pages and other names for this computer", () => {
        expect(refuseRequest({ ...good, origin: "https://evil.example" }, 5507, "abc")?.status).toBe(403)
        expect(refuseRequest({ ...good, host: "evil.example:5507" }, 5507, "abc")?.status).toBe(403)
    })
})
