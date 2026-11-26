import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { escapeHtml } from "./escapeHtml"

describe("a church's name in a label", () => {
    it("is shown as text, never read as markup", () => {
        expect(escapeHtml(`<img src=x onerror=alert(1)> & "Friends"`)).toBe("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Friends&quot;")
        // the one label that carries someone else's words
        const account = readFileSync(join(__dirname, "../components/main/popups/church/ChurchAccount.svelte"), "utf8")
        expect(account).toContain('translateText("account.type_to_confirm", $dictionary, [escapeHtml(church.name)])')
    })
})
