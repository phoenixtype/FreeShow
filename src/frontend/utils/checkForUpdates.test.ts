import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getUpdateData, isNewerVersion } from "./checkForUpdates"

const releases = (...tags: string[]) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => tags.map((tag_name) => ({ tag_name, draft: false, prerelease: tag_name.includes("-") })) }))

describe("update check (R5)", () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each([
        ["1.2.6", "1.2.5", true],
        ["1.10.0", "1.9.9", true],
        ["2.0.0", "1.99.99", true],
        ["1.2.5", "1.2.5", false],
        ["1.2.5", "1.3.0", false],
        ["1.2.5", "1.2.5-beta.1", true],
        ["1.2.5-beta.1", "1.2.5", false],
        ["1.2.5-beta.10", "1.2.5-beta.2", true],
        ["", "1.2.5", false]
    ])("%s is newer than %s: %s", (latest, current, expected) => {
        expect(isNewerVersion(latest as string, current as string)).toBe(expected)
    })

    it("does not offer an older release as an update", async () => {
        releases("v1.2.5")
        expect((await getUpdateData("1.3.0", false)).hasUpdate).toBe(false)
    })

    it("offers a newer release", async () => {
        releases("v1.3.0")
        expect((await getUpdateData("1.2.5", false)).hasUpdate).toBe(true)
    })

    it("turns automatic updates on when nobody has chosen, and keeps an off choice", () => {
        const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8")
        expect(read("utils/updateSettings.ts")).toContain("if (v.autoUpdates === undefined) v.autoUpdates = true")
        // switching it off has to be stored as false, or the next start turns it on again
        expect(read("components/main/popups/UpdateManager.svelte")).toContain('if (!value && key !== "autoUpdates") delete a[key]')
    })
})
