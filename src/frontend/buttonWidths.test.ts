import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parse, walk } from "svelte/compiler"
import { describe, expect, it } from "vitest"

// house rule: a button is as wide as its words. No full-width buttons and no buttons splitting a row.
const src = join(__dirname, "..")
const BUTTONS = ["MaterialButton", "Button", "button"]
const STRETCH = /(?<![-\w])(width\s*:\s*100%|flex\s*:\s*1(?![\d.])|flex-grow\s*:\s*1)/

const svelteIn = (dir: string) =>
    readdirSync(join(src, dir))
        .filter((name) => name.endsWith(".svelte"))
        .map((name) => `${dir}/${name}`)

// screens that have been cleared of them; add a file here once it is
const FILES = [
    ...svelteIn("frontend/ai/components/popups"),
    ...svelteIn("frontend/ai/components/settings"),
    "frontend/ai/components/floating/AiFloating.svelte",
    "frontend/ai/components/floating/CopilotPreview.svelte",
    "frontend/ai/components/floating/AiChat.svelte",
    "frontend/ai/components/floating/AiTranscription.svelte",
    "frontend/ai/components/floating/SmartAction.svelte",
    "frontend/ai/components/floating/ScreenControl.svelte",
    "frontend/components/main/popups/ChurchLibrary.svelte",
    ...svelteIn("frontend/components/main/popups/church"),
    "frontend/ai/components/floating/MatthiasInput.svelte",
    "frontend/components/output/preview/ClearButtons.svelte",
    "frontend/components/settings/tabs/Connection.svelte",
    "frontend/components/drawer/media/Media.svelte",
    "frontend/components/main/popups/Import.svelte",
    "frontend/components/main/Splash.svelte",
    "server/controller/App.svelte",
    "server/remote/components/pages/Show.svelte",
    "server/remote/components/show/Clear.svelte"
]

function stretched(path: string) {
    const code = readFileSync(join(src, path), "utf8")
    const found: string[] = []

    const markup = code.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    walk(parse(markup).html as any, {
        enter(node: any) {
            if (!["Element", "InlineComponent"].includes(node.type) || !BUTTONS.includes(node.name)) return
            const style = node.attributes.find((a: any) => a.name === "style")
            const text = style ? markup.slice(style.start, style.end) : ""
            if (STRETCH.test(text)) found.push(`<${node.name} ${text}>`)
        }
    })

    for (const [, style] of code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        for (const [, selector, body] of style.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (/(\bbutton\b|clearAll)/.test(selector) && STRETCH.test(body)) found.push(`${selector.trim()} { ${body.match(STRETCH)![0]} }`)
        }
    }

    return found
}

describe("no stretched buttons", () => {
    for (const path of FILES) it(path, () => expect(stretched(path)).toEqual([]))
})
