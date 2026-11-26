import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse, walk } from "svelte/compiler"
import { describe, expect, it } from "vitest"

// house rule: transport and clear buttons carry words, whatever the labels setting
const src = join(__dirname, "..")
const read = (path: string) => readFileSync(join(src, path), "utf8")

const BUTTONS = ["MaterialButton", "Button", "button"]

// the tags with only an icon inside
function wordless(path: string) {
    const markup = read(path).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    const found: string[] = []

    walk(parse(markup).html as any, {
        enter(node: any) {
            if (!["Element", "InlineComponent"].includes(node.type) || !BUTTONS.includes(node.name)) return
            let words = false
            walk(node, {
                enter(child: any) {
                    // attribute values are not on screen
                    if (child.type === "Attribute" || child.type === "Binding" || child.type === "EventHandler") return this.skip()
                    if (child.type === "Text" && /[a-z]{2}/i.test(child.data)) words = true
                    if (child.type === "MustacheTag" || (child.type === "InlineComponent" && child.name === "T")) words = true
                }
            })
            if (!words) found.push(markup.slice(node.start, node.start + 90).replace(/\s+/g, " "))
        }
    })

    return found
}

describe("transport and clear buttons carry words", () => {
    for (const path of ["frontend/ai/components/floating/CopilotPreview.svelte", "server/controller/App.svelte", "server/remote/components/pages/Show.svelte", "server/remote/components/show/Clear.svelte"]) {
        it(path, () => expect(wordless(path)).toEqual([]))
    }

    it("keeps the clear button words when labels are turned off", () => {
        expect(read("frontend/components/output/preview/ClearButtons.svelte")).not.toContain("labelsDisabled")
    })
})

describe("the panel preview", () => {
    it("can bring back what was cleared", () => {
        const preview = read("frontend/ai/components/floating/CopilotPreview.svelte")
        expect(preview).toContain("on:click={restoreOutput}")
        expect(preview).toContain("Bring it back")
    })
})
