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
