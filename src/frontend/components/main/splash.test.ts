import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

const splash = readFileSync(join(__dirname, "Splash.svelte"), "utf8")

it("numbers the first-run steps without circles", () => {
    expect(splash).not.toContain("border-radius: 50%")
})

it("does not stretch the home screen's buttons to one width", () => {
    expect(splash).not.toContain("align-items: stretch")
    expect(splash).toMatch(/\.buttons \{[^}]*align-items: center/)
})

it("offers the starter hymns by a button, and never adds them by itself", () => {
    expect(splash).toMatch(/on:click=\{addStarterHymns\}>Add \{STARTER_HYMNS\.length\} starter hymns</)
    expect(splash).not.toMatch(/addStarterHymns\(/)
})

it("asks a new church to choose the screen, with the app's own screen picker", () => {
    expect(splash).toMatch(/label: "Choose the screen"[\s\S]{0,300}activePopup\.set\("choose_screen"\)/)
})
