import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"

const splash = readFileSync(join(__dirname, "Splash.svelte"), "utf8")
const en = JSON.parse(readFileSync(join(__dirname, "../../../../public/lang/en.json"), "utf8")).account

it("numbers the first-run steps without circles", () => {
    expect(splash).not.toContain("border-radius: 50%")
})

it("does not stretch the home screen's buttons to one width", () => {
    expect(splash).not.toContain("align-items: stretch")
    expect(splash).toMatch(/\.buttons \{[^}]*align-items: center/)
})

it("offers the starter hymns by a button, and never adds them by itself", () => {
    expect(splash).toMatch(/on:click=\{addStarterHymns\}><T id="account\.add_starter_hymns" replace=\{\[String\(STARTER_HYMNS\.length\)\]\} \/></)
    expect(en.add_starter_hymns).toBe("Add $1 starter hymns")
    expect(splash).not.toMatch(/addStarterHymns\(/)
})

it("asks a new church to choose the screen, with the app's own screen picker", () => {
    expect(splash).toMatch(/label: translateText\("account\.ready_screen", \$dictionary\)[\s\S]{0,300}activePopup\.set\("choose_screen"\)/)
    expect(en.ready_screen).toBe("Choose the screen")
})
