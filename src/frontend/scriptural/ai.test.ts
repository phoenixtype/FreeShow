import { get } from "svelte/store"
import { beforeEach, expect, it, vi } from "vitest"
const { invoke, newToast } = vi.hoisted(() => ({ invoke: vi.fn(), newToast: vi.fn() }))
vi.mock("./connection", () => ({ churchLibrary: { getSession: () => ({}), invoke } }))
vi.mock("../utils/common", () => ({ newToast }))
import { completeWithScripturalAI } from "./ai"
import { planNotice, planProblem } from "./planNotice"

vi.stubGlobal("localStorage", { getItem: () => "church" })
const answer = (status: number, data: unknown) => invoke.mockResolvedValue({ ok: status < 300, status, data })
beforeEach(() => invoke.mockReset())

it("says that a plan is needed once a session, with the status", async () => {
    answer(402, { error: "plan_required", message: "raw from the server" })
    const first = await completeWithScripturalAI({ prompt: "hi" })
    expect(first).toMatchObject({ text: "", status: 402, error: expect.stringMatching(/Church plan/) })
    expect(get(planNotice)).toBe(first.error)
    expect(newToast).toHaveBeenCalledTimes(1)

    // closed by the operator: not shown again this session
    planNotice.set("")
    await completeWithScripturalAI({ prompt: "hi" })
    expect(get(planNotice)).toBe("")
    expect(newToast).toHaveBeenCalledTimes(1)
    // and whoever asks is still told why
    expect(get(planProblem)).toMatch(/Church plan/)

    answer(200, { text: "ok" })
    await completeWithScripturalAI({ prompt: "hi" })
    expect(get(planProblem)).toBe("")
})

it.each([
    [402, "allowance_used", /used up/],
    [401, "unauthorized", /Sign in/],
    [403, "forbidden", /owners, admins and editors/],
    [429, "rate_limited", /Wait a minute/],
    [400, "bad_request", /too long/],
    [500, "PGRST202", /not answering/]
])("answers %i %s in plain words, never the server's own", async (status, code, words) => {
    answer(status, { error: code, message: "relation public.churches does not exist" })
    const reply = await completeWithScripturalAI({ prompt: "hi" })
    expect(reply.error).toMatch(words)
    expect(reply.error).not.toContain("relation")
})

it("tells the proxy whether it is listening to a sermon or answering someone", async () => {
    answer(200, { text: "ok" })
    await completeWithScripturalAI({ prompt: "hi" }, "listen")
    expect(invoke.mock.calls[0][1]).toMatchObject({ task: "listen" })
    await completeWithScripturalAI({ prompt: "hi" })
    expect(invoke.mock.calls[1][1]).toMatchObject({ task: "ask" })
})
