import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8")
const MAIL = "mailto:support@scriptural.online?subject=Scriptural%20Project%20feedback"

describe("a way to reach us (W7)", () => {
    it("is on the About popup", () => {
        expect(read("frontend/components/main/popups/About.svelte")).toContain(MAIL)
    })

    it("is Send feedback in the native Help menu", () => {
        expect(read("electron/utils/menuTemplate.ts")).toContain(`label: strings.main?.send_feedback || "Send feedback", click: () => openURL("${MAIL}")`)
    })

    it("is Send feedback in the in-app Help menu", () => {
        expect(read("frontend/components/context/contextMenus.ts")).toMatch(/help: \[[^\]]*"send_feedback"/)
        expect(read("frontend/components/context/contextMenus.ts")).toContain('send_feedback: { label: "main.send_feedback"')
        expect(read("frontend/components/context/menuClick.ts")).toContain(`send_feedback: () => sendMain(Main.URL, "${MAIL}")`)
        expect(JSON.parse(read("../public/lang/en.json")).main.send_feedback).toBe("Send feedback")
    })
})
