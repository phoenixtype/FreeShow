import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

const read = (path: string) => readFileSync(join(__dirname, path), "utf8")

it("gives a switch with no visible label an accessible name", () => {
    expect(read("components/inputs/MaterialToggleSwitch.svelte")).toContain("aria-label={translateText(title || label) || undefined}")
})

it("says how sure a match is in figures, not only colour", () => {
    const meter = read("ai/components/floating/ConfidenceMeter.svelte")
    expect(meter).toContain("{safeConfidence}%")
    expect(meter).toContain('aria-label="Confidence {safeConfidence}%"')
})

it("shows the shortcut as Cmd on a Mac", () => {
    expect(read("components/main/Top.svelte")).toContain("$os.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+J]")
})

it("keeps a focus outline on the request box", () => {
    const input = read("ai/components/floating/MatthiasInput.svelte")
    expect(input).not.toContain("outline: none")
    expect(input).toContain("input:focus-visible")
})
