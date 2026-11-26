import { describe, expect, it, vi } from "vitest"

const send = vi.hoisted(() => vi.fn())
vi.mock("../../IPC/main", () => ({ sendMain: send }))
vi.mock("../../stores", async () => ({ ai: (await import("svelte/store")).writable({}) }))

import { ai } from "../../stores"
import { logDetection } from "./detectionLog"

const detection = { heard: "john three sixteen", tier: "reference" as const, confidence: 98, found: "John 3:16", action: "shown" as const }

describe("keeping a record of what was detected", () => {
    it("is off until the operator switches it on", () => {
        logDetection(detection)
        expect(send).not.toHaveBeenCalled()

        ai.set({ detectionLog: true } as any)
        logDetection(detection)
        expect(send).toHaveBeenCalledWith("SERVICE_RECORDS", { action: "detection", detection })
    })
})
