import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"

// house rule: no sparkle or magic wand anywhere: the app, the phone and browser views, or the words
const root = join(__dirname, "../../..")

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return files(path)
        return /\.(svelte|ts|json|html|css|svg)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
    })
}

// the two glyphs Material draws them with, and the names and emoji they go by
const SPARKLE = /M19 9l1\.25-2\.75L23 5|M7\.5 5\.6L10 7|sparkle|\bwand\b|magic[ _-]?wand|auto_?awesome|\u{2728}|\u{1FA84}/iu

it("has no sparkle or wand anywhere in the app", () => {
    const found = ["src/frontend", "src/server", "public/lang"]
        .flatMap((dir) => files(join(root, dir)))
        .filter((file) => SPARKLE.test(readFileSync(file, "utf8")))
        .map((file) => relative(root, file))
    expect(found).toEqual([])
})
