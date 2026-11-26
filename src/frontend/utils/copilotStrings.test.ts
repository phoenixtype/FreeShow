// The Copilot and account screens take their words from en.json, under matthias.* and account.*
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { get } from "svelte/store"
import { expect, it, vi } from "vitest"

vi.mock("../stores", async () => {
    const { writable } = await import("svelte/store")
    return { dictionary: writable({}), language: writable("en"), localeDirection: writable("ltr") }
})
vi.mock("../IPC/main", () => ({ sendMain: vi.fn() }))
vi.mock("./common", () => ({ isMainWindow: () => false }))
vi.mock("./request", () => ({ send: vi.fn() }))

const { dictionary } = await import("../stores")
const { setLanguage } = await import("./language")

const frontend = join(__dirname, "..")
const lang = (id: string) => JSON.parse(readFileSync(join(frontend, `../../public/lang/${id}.json`), "utf8"))
const en = lang("en")

const svelteIn = (path: string): string[] => (statSync(join(frontend, path)).isDirectory() ? readdirSync(join(frontend, path)).flatMap((name) => svelteIn(`${path}/${name}`)) : path.endsWith(".svelte") ? [path] : [])
const FILES = ["ai/components", "ai/records", "components/main/popups/ChurchLibrary.svelte", "components/main/popups/church", "components/main/popups/ScripturalBibles.svelte", "components/main/popups/ImportScripture.svelte", "components/main/Splash.svelte", "components/drawer/bible/Scripture.svelte"].flatMap(svelteIn)

const used = FILES.flatMap((file) => [...readFileSync(join(frontend, file), "utf8").matchAll(/["'](matthias|account)\.(\w+)["']/g)].map(([, group, key]) => ({ file, group, key })))

it("has every key these screens use", () => {
    expect(used.filter(({ group, key }) => !en[group]?.[key]).map(({ file, group, key }) => `${file}: ${group}.${key}`)).toEqual([])
})

it("keeps no key that no screen uses", () => {
    const keys = new Set(used.map(({ group, key }) => `${group}.${key}`))
    const all = ["matthias", "account"].flatMap((group) => Object.keys(en[group]).map((key) => `${group}.${key}`))
    expect(all.filter((key) => !keys.has(key))).toEqual([])
})

it("shows the English words in a language that does not have them yet", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({ json: async () => lang(url.replace(/^\.\/lang\/|\.json$/g, "")) }))
    )
    expect(lang("de").matthias).toBeUndefined()

    setLanguage("de", true)
    await vi.waitFor(() => expect(get(dictionary).main).toBeDefined())

    expect(get(dictionary).matthias).toEqual(en.matthias)
    expect(get(dictionary).account).toEqual(en.account)
    expect(get(dictionary).main?.quit).toBe(lang("de").main.quit)
    vi.unstubAllGlobals()
})
