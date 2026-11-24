import { describe, expect, it } from "vitest"
import { fitsSchema, listenWords, modelSteps } from "./routing"

const ids = (request: Parameters<typeof modelSteps>[0]) => modelSteps(request).map((step) => step.providerId)

describe("modelSteps", () => {
    it("asks this computer before the plan's Claude", () => {
        expect(ids({ provider: "scriptural", model: "", local: "gemma3:4b" })).toEqual(["ollama", "scriptural"])
    })
    it("asks Claude first once the local model has got it wrong, and keeps it as the backup", () => {
        expect(ids({ provider: "scriptural", model: "", local: "gemma3:4b", struggling: true })).toEqual(["scriptural", "ollama"])
    })
    it("leaves a church's own key first", () => {
        expect(ids({ provider: "anthropic", model: "m", local: "gemma3:4b" })).toEqual(["anthropic", "ollama"])
    })
    it("uses what there is", () => {
        expect(ids({ provider: "scriptural", model: "" })).toEqual(["scriptural"])
        expect(ids({ provider: "ollama", model: "gemma3:4b", local: "other" })).toEqual(["ollama"])
    })
})

it("spends the plan on a sermon far more slowly than a local model", () => {
    const sermon = 45 * 130
    const [local, plan] = modelSteps({ provider: "scriptural", model: "", local: "gemma3:4b" }).map((step) => Math.floor(sermon / listenWords(step)))
    expect(local).toBe(390)
    expect(plan * 4).toBeLessThan(1000)
})

it("knows an answer with fields missing", () => {
    const schema = { type: "object", properties: { type: {}, content: {} }, required: ["type", "content"] }
    expect(fitsSchema({ type: "empty", content: "" }, schema)).toBe(true)
    expect(fitsSchema({ type: "scripture" }, schema)).toBe(false)
    expect(fitsSchema([], schema)).toBe(false)
    expect(fitsSchema(null, undefined)).toBe(false)
})
