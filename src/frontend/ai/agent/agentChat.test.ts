import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("./agentTools", () => ({ listAgentTools: () => [{ name: "show_scripture", description: "Shows", inputSchema: { properties: { reference: {} } } }], runAgentTool: vi.fn() }))
import { agentInstructions, MAX_STEPS, runAgentChat } from "./agentChat"

const history = [{ role: "user", content: "Put up John 3:16" }]
const run = vi.fn()
beforeEach(() => run.mockReset())

describe("runAgentChat", () => {
    it("runs the tool asked for, then answers from its result", async () => {
        run.mockResolvedValue({ ok: true, result: { shown: "John 3:16" } })
        const prompts: string[] = []
        const turns = [
            { content: "", tool: "show_scripture", arguments: '{"reference":"John 3:16"}' },
            { content: "John 3:16 is up.", tool: null }
        ]
        const answer = await runAgentChat(history, { run, ask: async (p) => (prompts.push(p), turns.shift()!) })
        expect(run).toHaveBeenCalledWith("show_scripture", { reference: "John 3:16" })
        expect(prompts[1]).toContain('{"shown":"John 3:16"}')
        expect(answer?.content).toBe("John 3:16 is up.")
    })

    it("tells the model when a tool fails or its arguments are not JSON", async () => {
        run.mockResolvedValue({ ok: false, error: "The screen is locked." })
        const prompts: string[] = []
        const turns = [{ tool: "show_scripture", arguments: "{oops" }, { tool: "show_scripture", arguments: "{}" }, { content: "It is locked." }]
        await runAgentChat(history, { run, ask: async (p) => (prompts.push(p), turns.shift()!) })
        expect(prompts[1]).toContain("not a JSON object")
        expect(prompts[2]).toContain("The screen is locked.")
    })

    it("stops a loop that never answers", async () => {
        run.mockResolvedValue({ ok: true, result: "Done." })
        const answer = await runAgentChat(history, { run, ask: async () => ({ tool: "control_screen", arguments: '{"command":"next"}' }) })
        expect(run).toHaveBeenCalledTimes(MAX_STEPS)
        expect(answer?.content).toMatch(/more steps/)
    })

    it("has no answer when the model has none", async () => {
        expect(await runAgentChat(history, { run, ask: async () => null })).toBeNull()
    })

    it("lists the tools to the model", () => {
        expect(agentInstructions()).toContain("show_scripture(reference)")
    })
})
