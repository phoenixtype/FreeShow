import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const root = join(__dirname, "../..")
const require = createRequire(import.meta.url)
const read = (file: string) => readFileSync(join(root, file), "utf8")

const release = read(".github/workflows/release.yml")
// one workflow job's text
const job = (name: string) => release.split(new RegExp(`^  ${name}:$`, "m"))[1].split(/^ {2}[a-z_]+:$/m)[0]

describe("release builds", () => {
    it.each(["publish_windows", "publish_linux", "publish_linux_arm", "publish_mac"])("%s gets every key secret", (name) => {
        const names: string[] = Object.values(require(join(root, "scripts/ownKeys.js")).ENV)
        for (const env of names) expect(job(name)).toContain(`${env}: \${{ secrets.${env} }}`)
    })

    it("checks the mac apps are notarized before the release can be published", () => {
        expect(job("publish_mac")).toContain("xcrun stapler validate")
        expect(job("publish_mac")).toContain("spctl --assess")
    })
})

describe("notarizing", () => {
    afterEach(() => vi.unstubAllEnvs())

    const context = { electronPlatformName: "darwin", appOutDir: "/nowhere", packager: { appInfo: { productFilename: "App" } } }
    const notarize = require(join(root, "scripts/macos/notarize.js")).default

    const withoutCredentials = (ci: string) => {
        vi.stubEnv("APPLE_API_KEY", "")
        vi.stubEnv("APPLE_ID", "")
        vi.stubEnv("CI", ci)
    }

    it("fails in CI when there is no Apple credential, instead of shipping an unnotarized app", async () => {
        withoutCredentials("true")
        await expect(notarize(context)).rejects.toThrow(/notariz/i)
    })

    it("still skips quietly on a local build", async () => {
        withoutCredentials("")
        await expect(notarize(context)).resolves.toBeUndefined()
    })

    it("does nothing for other platforms", async () => {
        withoutCredentials("true")
        await expect(notarize({ ...context, electronPlatformName: "win32" })).resolves.toBeUndefined()
    })
})

describe("leftover upstream identifiers (R8)", () => {
    it("names the package and its author as Scriptural Project", () => {
        const pkg = JSON.parse(read("package.json"))
        expect(pkg.name).toBe("scriptural-project")
        expect(pkg.author).toBe("Scriptural Project <support@scriptural.online>")
        // the data folder and the installed app's identity come from these two and must not move
        expect(pkg.productName).toBe("Scriptural Project")
        expect(read("config/building/electron-builder.yaml")).toContain("appId: online.scriptural.project")
    })

    it("carries no analytics account", () => {
        expect(read("src/frontend/utils/analytics.ts")).not.toMatch(/google-analytics|G-[A-Z0-9]{6,}|api_secret/i)
    })

    it("gives the snap config no upstream contact or links", () => {
        expect(read("config/building/snapcraft.yaml")).not.toMatch(/freeshow\.app|churchapps/i)
    })

    it("does not run another organisation's workflow on every push", () => {
        const scan = read(".github/workflows/polinrider-scan.yml")
        expect(scan).not.toMatch(/^ {2}(push|pull_request|schedule):/m)
        expect(scan).toContain("workflow_dispatch:")
    })
})

describe("source offer (W1)", () => {
    it("attaches the tag's source archive before the release goes public", () => {
        const publish = job("publish_release")
        expect(publish).toContain("git archive --format=tar.gz")
        expect(publish).toContain('"scriptural-project-$version-source.tar.gz"')
        expect(publish.indexOf("gh release upload")).toBeGreaterThan(0)
        expect(publish.indexOf("gh release upload")).toBeLessThan(publish.indexOf("--draft=false"))
    })

    it("leaves internal notes out of the archive", () => {
        expect(read(".gitattributes")).toMatch(/^\/docs export-ignore$/m)
    })
})
