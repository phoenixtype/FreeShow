import { describe, expect, it, vi } from "vitest"
import { holdSingleInstance } from "./singleInstance"

function fakeApp(gotLock: boolean) {
    const listeners: Record<string, () => void> = {}
    return { listeners, requestSingleInstanceLock: () => gotLock, exit: vi.fn(), on: (name: string, listener: () => void) => (listeners[name] = listener) }
}

describe("holdSingleInstance", () => {
    it("closes a second copy of the app straight away", () => {
        const app = fakeApp(false)
        holdSingleInstance(app as any, () => null)
        expect(app.exit).toHaveBeenCalledWith(0)
    })

    it("brings the open window forward when someone starts the app again", () => {
        const app = fakeApp(true)
        const window = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
        holdSingleInstance(app as any, () => window as any)
        app.listeners["second-instance"]()
        expect(app.exit).not.toHaveBeenCalled()
        expect(window.restore).toHaveBeenCalled()
        expect(window.show).toHaveBeenCalled()
        expect(window.focus).toHaveBeenCalled()
    })
})
