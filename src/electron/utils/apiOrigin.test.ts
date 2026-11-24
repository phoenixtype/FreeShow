import { expect, it, vi } from "vitest"
vi.mock("../IPC/main", () => ({ requestToMain: vi.fn(), sendToMain: vi.fn() }))
vi.mock("./oscPatch", () => ({}))
vi.mock("./helpers", () => ({ waitUntilValueIsDefined: vi.fn() }))
import { isForeignPage } from "./api"

it("lets programs and pages of this network in, and no website", () => {
    expect(isForeignPage({})).toBe(false)
    for (const origin of ["http://localhost:8080", "http://192.168.2.181:5510", "http://172.20.1.4", "http://booth.local"]) expect(isForeignPage({ origin })).toBe(false)
    for (const origin of ["https://evil.example", "null", "http://192.168.1.1.evil.example", "http://10.evil.example"]) expect(isForeignPage({ origin })).toBe(true)
    expect(isForeignPage({ "sec-fetch-site": "cross-site" })).toBe(true)
})
