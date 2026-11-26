import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { captureConsole, diagnosticsText, keepLine } from "./diagnostics"

const source = (file: string) => readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), "utf8")
const report = () => diagnosticsText({ version: "1.2.5", os: "macOS 27.0 (arm64)" })

describe("Copy diagnostics", () => {
    it("gives the version, the computer and the last 200 log lines", () => {
        for (let i = 1; i <= 250; i++) keepLine("info", [`line ${i}`])
        const lines = report().split("\n")
        expect(lines[0]).toBe("Scriptural Project 1.2.5")
        expect(lines[1]).toBe("macOS 27.0 (arm64)")
        const logged = lines.filter((line) => / info line /.test(line))
        expect(logged).toHaveLength(200)
        expect(logged[0]).toContain("line 51")
        expect(logged[199]).toContain("line 250")
    })

    it("leaves out keys and sign-ins", () => {
        keepLine("error", ["Bearer abc.def-123 sk-ant-api03-SECRETSECRET AIzaSyA1234567890123456789 eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl"])
        const text = report()
        for (const secret of ["abc.def-123", "SECRETSECRET", "AIzaSyA1234567890123456789", "c2lnbmF0dXJl"]) expect(text).not.toContain(secret)
    })

    it("keeps what the app writes to its console, and still writes it", () => {
        const written = vi.fn()
        const fake = { log: written, info: written, warn: written, error: written, debug: written } as unknown as Console
        captureConsole(fake)
        fake.warn("could not find %s", "the screen")
        expect(written).toHaveBeenCalledWith("could not find %s", "the screen")
        expect(report()).toContain("warn could not find the screen")
    })

    it("is in Help, in the app's menu and the Mac's", () => {
        expect(source("src/frontend/components/context/contextMenus.ts")).toMatch(/help: \[[^\]]*"copy_diagnostics"/)
        expect(source("src/electron/utils/menuTemplate.ts")).toContain('mc("copy_diagnostics")')
        expect(source("src/frontend/components/context/menuClick.ts")).toContain("Main.COPY_DIAGNOSTICS")
    })
})

describe("crash reporting", () => {
    it("sends nothing to anyone", () => {
        for (const file of ["package.json", "src/frontend/main.ts", "src/electron/index.ts", "src/electron/IPC/responsesMain.ts", "src/frontend/components/settings/tabs/Other.svelte"]) expect(source(file)).not.toMatch(/sentry|autoErrorReport/i)
    })
})
