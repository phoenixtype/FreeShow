import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

// House rule: dialog actions sit at the right edge and no button is full width.
// In the church library windows every button is inside a row that ends at the right:
// class "actions" (right aligned), "spaced" (words left, button right) or a list "line".
const folder = new URL("./", import.meta.url)
const files = [
    new URL("../ChurchLibrary.svelte", import.meta.url),
    ...readdirSync(folder)
        .filter((name) => name.endsWith(".svelte"))
        .map((name) => new URL(name, folder))
]

describe("church library buttons", () => {
    it.each(files.map((url) => [url.pathname.split("/").pop(), url]))("%s keeps its buttons at the right edge", (_name, url) => {
        const markup = readFileSync(url as URL, "utf8").split("<style>")[0]
        const open: string[] = []
        const left: string[] = []
        for (const [tag, closing, classes] of markup.matchAll(/<(\/)?div(?:\s+class="([^"]*)")?[^>]*>|<MaterialButton\b/g)) {
            if (tag.startsWith("<MaterialButton")) {
                if (!/\b(actions|spaced|line)\b/.test(open.join(" "))) left.push(markup.slice(markup.indexOf(tag)).split("\n")[0])
            } else if (closing) open.pop()
            else open.push(classes || "")
        }
        expect(left).toEqual([])
    })

    it("has a right-aligned actions row wherever it names one", () => {
        for (const url of files) {
            const source = readFileSync(url, "utf8")
            if (source.includes('class="actions')) expect(source).toMatch(/\.actions\s*{[^}]*justify-content: flex-end/)
        }
    })
})
