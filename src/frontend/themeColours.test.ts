import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { defaultThemes } from "./components/settings/tabs/defaultThemes"

const hex = (value: string) => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16))
function luminance(value: string) {
    const [r, g, b] = hex(value).map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
}

// muted text, error text and borders are mixed from each theme's own colours in global.css, so
// saved and custom themes get readable ones too. This checks the mix on Scriptural's two themes.
const css = readFileSync(join(__dirname, "../../public/global.css"), "utf8")
function mixed(variable: string, colors: Record<string, string | null>) {
    const found = css.match(new RegExp(`--${variable}: color-mix\\(in srgb, (var\\(--([\\w-]+)\\)|#[0-9a-f]{6}) (\\d+)%, var\\(--([\\w-]+)\\)\\)`))
    expect(found, variable).toBeTruthy()
    const first = hex(found![2] ? colors[found![2]]! : found![1])
    const second = hex(colors[found![4]]!)
    const share = Number(found![3]) / 100
    return (
        "#" +
        first
            .map((c, i) =>
                Math.round(c * share + second[i] * (1 - share))
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
    )
}

describe("light and dark themes", () => {
    for (const id of ["default", "light"]) {
        it(`${id}: muted and error text can be read`, () => {
            const colors = defaultThemes[id].colors
            for (const variable of ["muted-text", "error-text"]) {
                for (const ground of ["primary", "primary-darker", "primary-darkest"]) expect(contrast(mixed(variable, colors), colors[ground]!), `${variable} on ${ground}`).toBeGreaterThanOrEqual(4.5)
            }
        })
    }

    it("draws borders from the theme's text colour", () => {
        expect(css).toMatch(/--border: color-mix\(in srgb, var\(--text\)/)
    })
})

// fixed light text disappears on the light theme
describe("assistant panel text colours", () => {
    const dir = join(__dirname, "ai/components")
    const files = (at: string): string[] => readdirSync(at).flatMap((name) => (statSync(join(at, name)).isDirectory() ? files(join(at, name)) : name.endsWith(".svelte") ? [join(at, name)] : []))

    // edited by another change on 2026-11-26; take a file off this list once its colours are variables
    const PENDING = ["floating/AiTranscription.svelte"]

    it("uses theme variables, never a fixed colour, for text", () => {
        const found = files(dir)
            .filter((file) => !PENDING.some((name) => file.endsWith(name)))
            .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/(?<![-\w])color:\s*(#[0-9a-f]{3,8}|rgba?\()[^;"]*/gi)].map((match) => `${file.slice(dir.length + 1)}: ${match[0]}`))
        expect(found).toEqual([])
    })
})
