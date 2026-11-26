import { describe, expect, it, vi } from "vitest"

const updater = vi.hoisted(() => ({ autoInstallOnAppQuit: false, checkForUpdatesAndNotify: vi.fn().mockResolvedValue(null) }))
vi.mock("electron-updater", () => ({ autoUpdater: updater }))
vi.mock("..", () => ({ isProd: true }))

describe("automatic update", () => {
    it("installs on quit and says so in plain words", async () => {
        const { default: checkForUpdates } = await import("./updater")
        await checkForUpdates()

        expect(updater.autoInstallOnAppQuit).toBe(true)
        expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledWith({ title: "Scriptural Project", body: "Version {version} is ready. It installs when you close the app." })
    })
})
