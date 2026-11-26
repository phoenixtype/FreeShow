// A failure has to be seen, said in words a volunteer can act on, and lose nothing typed.
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const en = JSON.parse(read("../../../../public/lang/en.json"))

it("keeps what was typed when there is no model, and says why there is no answer", () => {
    const chat = read("./floating/AiChat.svelte")
    expect(chat.indexOf("if (!llm)")).toBeLessThan(chat.indexOf('chatInput = ""\n\n        isSending'))
    expect(chat).toContain("$planProblem || ")
})

it("says what to do when a key is refused", () => {
    expect(read("./popups/LlmOptions.svelte")).not.toContain('newToast("Invalid key")')
    expect(read("./popups/LlmOptions.svelte")).toContain('newToast(translateText("matthias.key_refused"))')
    expect(en.matthias.key_refused).toContain("That key was not accepted.")
})

it("says so when the church plan or an access request cannot be checked", () => {
    const bibles = read("../../components/main/popups/ScripturalBibles.svelte")
    expect(bibles).toContain('<T id="account.plan_unknown" />')
    expect(en.account.plan_unknown).toContain("Your church plan could not be checked.")
    expect(bibles).not.toMatch(/err\.message : translateText\("account\.request_failed"/)
    expect(bibles).toContain('messages[version.code] = translateText("account.request_failed")')
})
