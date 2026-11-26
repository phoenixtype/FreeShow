import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("release notes", () => {
    it("are shown as text: what is written in them is never run", () => {
        const popup = readFileSync(fileURLToPath(new URL("./NewUpdate.svelte", import.meta.url)), "utf8")
        expect(popup).not.toContain("{@html")
        expect(popup).toContain("{changelog}")
    })
})
