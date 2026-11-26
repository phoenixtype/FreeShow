// One copy of the app at a time: two would write the same files over each other.

import type { App, BrowserWindow } from "electron"

export function holdSingleInstance(app: App, getWindow: () => BrowserWindow | null) {
    if (!app.requestSingleInstanceLock()) return app.exit(0)

    app.on("second-instance", () => {
        const window = getWindow()
        if (!window || window.isDestroyed()) return
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
    })
}
