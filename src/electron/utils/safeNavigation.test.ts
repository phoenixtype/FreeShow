import { describe, expect, it, vi } from "vitest"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { guardContents, isAllowedExternalUrl, isAppUrl } from "./safeNavigation"

describe("what may be opened outside the app", () => {
    it("web pages, email, Spotify and the Mac's settings", () => {
        for (const url of ["https://example.org/a", "http://example.org", "mailto:a@example.org", "spotify:", "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"]) expect(isAllowedExternalUrl(url)).toBe(true)
    })
    it("nothing that runs or opens something on the computer", () => {
        for (const url of ["file:///etc/passwd", "smb://server/share", "javascript:alert(1)", "data:text/html,x", "vscode://file/x", "ms-msdt:x", "C:\\Windows\\System32\\calc.exe", "calc", ""]) expect(isAllowedExternalUrl(url)).toBe(false)
        expect(isAllowedExternalUrl(undefined as any)).toBe(false)
    })
})

describe("where the app's own windows may go", () => {
    const appPath = path.resolve("/Applications/Scriptural/app")
    const page = pathToFileURL(path.join(appPath, "public", "index.html")).href

    it("its own pages", () => {
        expect(isAppUrl(page, appPath, true)).toBe(true)
        expect(isAppUrl("http://localhost:3000/", appPath, false)).toBe(true)
    })
    it("not the web, another file, or the dev server in a release", () => {
        expect(isAppUrl("https://example.org", appPath, true)).toBe(false)
        expect(isAppUrl("file:///Users/someone/Downloads/page.html", appPath, true)).toBe(false)
        expect(isAppUrl(page.replace("public", "public/../.."), appPath, true)).toBe(false)
        expect(isAppUrl("http://localhost:3000/", appPath, true)).toBe(false)
        expect(isAppUrl("http://localhost:3000.example.org/", appPath, false)).toBe(false)
    })
})

describe("guardContents", () => {
    function fake(type: string) {
        const listeners: Record<string, (...args: any[]) => void> = {}
        let handler: (details: { url: string }) => { action: string } = () => ({ action: "allow" })
        const opened = vi.fn()
        guardContents({ getType: () => type, on: (name: string, listener: any) => (listeners[name] = listener), setWindowOpenHandler: (h: any) => (handler = h) } as any, { appPath: "/app", isProd: true, open: opened })
        const navigate = (url: string) => {
            const event = { preventDefault: vi.fn() }
            listeners["will-navigate"]?.(event, url)
            return event.preventDefault.mock.calls.length === 0
        }
        return { navigate, open: (url: string) => handler({ url }), opened }
    }

    it("keeps a window on the app and never opens another one", () => {
        const window = fake("window")
        expect(window.navigate("https://example.org")).toBe(false)
        expect(window.open("https://example.org")).toEqual({ action: "deny" })
        // a link goes to the browser instead
        expect(window.opened).toHaveBeenCalledWith("https://example.org")
    })

    it("lets a website shown on a slide browse, but not open windows", () => {
        const webview = fake("webview")
        expect(webview.navigate("https://example.org/next")).toBe(true)
        expect(webview.open("https://example.org")).toEqual({ action: "deny" })
        expect(webview.opened).not.toHaveBeenCalled()
    })
})
