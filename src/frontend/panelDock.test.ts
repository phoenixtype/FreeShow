import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

// house rule: the Matthias panel sits beside the app at every window width and never covers it
const layout = readFileSync(join(__dirname, "MainLayout.svelte"), "utf8")
const top = readFileSync(join(__dirname, "components/main/Top.svelte"), "utf8")

function insideMedia(css: string, needle: string) {
    const at = css.indexOf(needle)
    if (at < 0) return false
    let depth = 0
    for (const match of css.slice(0, at).matchAll(/@media[^{]*\{|\{|\}/g)) {
        if (match[0].startsWith("@media")) depth++
        else if (match[0] === "}" && depth > 0) depth--
        else if (match[0] === "{" && depth > 0) depth++
    }
    return depth > 0
}

it("pads the app for the docked panel outside any media query", () => {
    expect(layout).toContain(".column.docked")
    expect(insideMedia(layout, ".column.docked")).toBe(false)
})

it("uses one panel width in the layout and the top bar", () => {
    expect(layout).toContain("--copilot-width: clamp(320px, 32vw, 480px)")
    expect(top).toContain("Math.min(480, Math.max(320, innerWidth * 0.32))")
})
