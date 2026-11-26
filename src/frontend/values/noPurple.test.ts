import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"

// house rule: no purple, violet or fuchsia, in the app's chrome or in the palettes it offers
const src = join(__dirname, "../..")
const root = join(src, "..")

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return files(path)
        return /\.(svelte|ts|css|html|json)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
    })
}

function hueOf(r: number, g: number, b: number) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    // greys and near-greys have no hue worth naming
    if (d < 40) return null
    const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (hue * 60 + 360) % 360
}
// pure blue sits at 240, so near it only a washed-out blue (periwinkle, indigo) counts
const isPurple = (hue: number | null, faded = false) => hue !== null && hue < 324 && (hue >= 255 || (hue >= 235 && faded))
const isPurpleRgb = (r: number, g: number, b: number) => isPurple(hueOf(r, g, b), Math.min(r, g, b) >= 60)

function purples(text: string) {
    // comments are not on screen
    text = text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|^\s*\/\/.*$/gm, "")
    const found: string[] = []
    for (const match of text.matchAll(/#([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])/gi)) {
        const [r, g, b] = [0, 2, 4].map((at) => parseInt(match[1].slice(at, at + 2), 16))
        if (isPurpleRgb(r, g, b)) found.push(match[0])
    }
    for (const match of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) {
        if (isPurpleRgb(Number(match[1]), Number(match[2]), Number(match[3]))) found.push(match[0])
    }
    for (const match of text.matchAll(/hsla?\(\s*(\d+)(?:deg)?[\s,]+(\d+)%/gi)) {
        if (Number(match[2]) > 20 && isPurple(Number(match[1]))) found.push(match[0])
    }
    // a named hue given to a colour helper
    for (const match of text.matchAll(/hslToHex\(\s*(\d+)\s*,/g)) if (isPurple(Number(match[1]))) found.push(match[0])
    for (const match of text.matchAll(/(?<![-\w.])(?:color|background(?:-color)?|fill|stroke|border(?:-color)?)\s*:\s*(purple|violet|fuchsia|magenta|indigo|orchid|plum)\b/gi)) found.push(match[0])
    return found
}

// These are not the app choosing purple: they draw nature, a person's own content, or read other programs' files.
const NOT_OURS = [
    "frontend/components/output/effects/", // rainbows and auroras
    "frontend/components/slide/views/visualizer", // audio visualizer scenes a person picks
    "frontend/components/helpers/color.ts", // the slide colour picker: content, still to be decided
    "frontend/components/drawer/audio/effects/AudioEqualizer.svelte", // frequency spectrum
    "frontend/converters/", // colours named in imported files
    "frontend/utils/groupColors.ts", // lists FreeShow's old purple in order to replace it
    "frontend/utils/updateSettings.ts", // recognises a saved theme in FreeShow's old pink in order to replace it
    "frontend/utils/createData.ts", // example slides and backgrounds: content, still to be decided
    "frontend/components/drawer/media/CLogo.svelte", // Canva's own logo
    "frontend/ai/llm/prompts.ts" // example slide text for the model
]

it("finds purple in hex, rgb, hsl and named colours", () => {
    expect(purples("#8888ff rgb(160, 32, 240) hsl(280, 70%, 50%) color: purple")).toHaveLength(4)
    expect(purples("#3B82F6 #14B8A6 #F97316 #10B981 #9CA3AF #121212")).toEqual([])
})

it("has no purple in the app's own colours", () => {
    const found = [...files(src), ...files(join(root, "public"))].filter((file) => !/public[/\\](assets|lang|fonts)/.test(file) && !NOT_OURS.some((skip) => relative(src, file).split("\\").join("/").startsWith(skip))).flatMap((file) => purples(readFileSync(file, "utf8")).map((colour) => `${relative(root, file)}: ${colour}`))
    expect(found).toEqual([])
})
