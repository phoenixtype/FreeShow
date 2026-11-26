import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const page = readFileSync(join(__dirname, "../../public/index.html"), "utf8")
const policy = /Content-Security-Policy" content="([^"]+)"/.exec(page)![1]
const directive = (name: string) => (new RegExp(`(?:^|;\\s*)${name} ([^;]+)`).exec(policy)?.[1] || "").split(/\s+/)

describe("what may run in the app window", () => {
    it("takes scripts from the app and the YouTube player only", () => {
        const sources = directive("script-src")
        expect(sources).toContain("'self'")
        expect(sources).toContain("https://www.youtube.com")
        // any website, or text written into the page, could otherwise run as the app
        expect(sources).not.toContain("https://*")
        expect(sources).not.toContain("*")
        expect(sources).not.toContain("'unsafe-inline'")
    })
    it("allows no plugins and no change of base address", () => {
        expect(directive("object-src")).toEqual(["'none'"])
        expect(directive("base-uri")).toEqual(["'self'"])
    })
})
