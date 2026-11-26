import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

const app = readFileSync(join(__dirname, "App.svelte"), "utf8")
const clear = readFileSync(join(__dirname, "../remote/components/show/Clear.svelte"), "utf8")

it("says when the phone controller has lost the computer, and does not queue presses", () => {
    expect(app).toContain('socket.on("disconnect"')
    expect(app).toContain("Not connected to the computer. Trying again…")
    // socket.io would hold the presses and replay them all on reconnect
    expect(app).toMatch(/function sendAction\(id: string\) \{\s*if \(!connected\) return/)
    expect(app).toContain("class:offline={!connected}")
})

it("keeps the remote's clear buttons tall enough for a thumb", () => {
    expect(clear).toContain("min-height: 44px")
    expect(clear).not.toContain("min-height: auto")
})
