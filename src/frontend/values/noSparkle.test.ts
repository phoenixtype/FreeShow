import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

// house rule: no sparkle or magic wand anywhere in the app's own icons
const icons = readFileSync(join(__dirname, "icons.ts"), "utf8")

it("has no sparkle or wand among the app's icons", () => {
    expect(icons).not.toContain("M19 9l1.25-2.75L23 5")
    expect(icons).not.toContain("M7.5 5.6L10 7")
    expect(icons).not.toMatch(/sparkle|wand/i)
})
