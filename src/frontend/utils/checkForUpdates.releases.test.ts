import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("./../stores", async () => ({ activePopup: {}, alertUpdates: {}, isDev: {}, popupData: {}, special: {} }))
import { getUpdateData } from "./checkForUpdates"

describe("looking for a newer version", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("never takes the speech model's release for an app update", async () => {
        vi.stubGlobal("fetch", async () => ({ json: async () => [{ tag_name: "speech-model-1", draft: false, prerelease: true }, { tag_name: "v1.4.0", draft: false, prerelease: false }] }))
        for (const beta of [false, true]) expect(await getUpdateData("1.4.0", beta)).toMatchObject({ latestVersion: "1.4.0", hasUpdate: false })
    })
})
