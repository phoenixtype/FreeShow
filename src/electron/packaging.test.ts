import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const config = readFileSync(join(__dirname, "../../config/building/electron-builder.yaml"), "utf8")

// the entries of one platform's `files` list
function platformFiles(platform: string): string[] {
    const block = config.split(new RegExp(`^${platform}:$`, "m"))[1].split(/^[a-z]+:$/m)[0]
    const list = block.split(/^ {4}files:$/m)[1].split(/^ {4}[a-zA-Z]+:/m)[0]
    return [...list.matchAll(/^ {8}- "?([^"\n]+)"?$/gm)].map((match) => match[1])
}

describe("what goes into an installer", () => {
    it.each(["win", "linux", "mac"])("%s names the app's own folders, never the whole repository", (platform) => {
        const included = platformFiles(platform).filter((entry) => !entry.startsWith("!"))
        expect(included).toEqual(["build/electron/**", "build/types/**", "public/**", "LICENSE"])
    })
})
