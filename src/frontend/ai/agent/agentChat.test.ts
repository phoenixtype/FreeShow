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

    it("stops when told to, runs nothing refused, and does not repeat a failure", async () => {
        expect((await runAgentChat(history, { run, stopped: () => true, ask: async () => ({ tool: "show_scripture" }) }))?.content).toBe("Stopped.")
        expect(run).not.toHaveBeenCalled()
        let asked = 0
        const answer = await runAgentChat(history, { run, refuse: () => "Leave the screen to them.", ask: async () => (asked++, { tool: "show_scripture", arguments: "{}" }) })
        expect(run).not.toHaveBeenCalled()
        expect(asked).toBe(2)
        expect(answer?.content).toBe("Leave the screen to them.")
    })

    it("tells the model what the app looks like", async () => {
        let prompt = ""
        await runAgentChat(history, { run, context: "The app now: {}", ask: async (p) => ((prompt = p), { content: "ok" }) })
        expect(prompt).toContain("The app now")
    })

    it("has no answer when the model has none", async () => {
        expect(await runAgentChat(history, { run, ask: async () => null })).toBeNull()
    })

    it("does not call a tool that broke a badly written request", async () => {
        run.mockRejectedValueOnce(new Error("boom"))
        const prompts: string[] = []
        const turns = [{ tool: "show_scripture", arguments: "{}" }, { content: "It did not work." }]
        await runAgentChat(history, { run, ask: async (p) => (prompts.push(p), turns.shift()!) })
        expect(prompts[1]).toContain("did not work in the app")
        expect(prompts[1]).not.toContain("not a JSON object")
    })

    it("says what was done when the model then fails", async () => {
        run.mockResolvedValue({ ok: true, result: "Done." })
        const turns = [{ tool: "show_scripture", arguments: "{}" }, null]
        const answer = await runAgentChat(history, { run, ask: async () => turns.shift()! })
        expect(answer?.content).toMatch(/show scripture/)
        expect(answer?.content).toMatch(/AI model/)
    })

    it("lists the tools to the model", () => {
        expect(agentInstructions()).toContain("show_scripture(reference)")
    })
})
