import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { createContext, runInContext } from "node:vm"
import { afterEach, describe, expect, it, vi } from "vitest"
// @ts-ignore a Cloudflare Pages Function, plain JavaScript
import { onRequestGet } from "../../site/functions/download/[os].js"

const site = join(__dirname, "../../site")
const read = (file: string) => readFileSync(join(site, file), "utf8")

function htmlFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return htmlFiles(path)
        return name.endsWith(".html") ? [relative(site, path)] : []
    })
}
// the platform admin and the sign-in hand-off are not public pages
const PUBLIC = htmlFiles(site).filter((file) => !/^(admin|signed-in|backgrounds)\//.test(file))
const INDEXABLE = ["index.html", "guide/index.html", "loops/index.html", "pricing/index.html", "licences/index.html", "privacy/index.html", "terms/index.html"]
const urlOf = (file: string) => "https://project.scriptural.online/" + file.replace(/index\.html$/, "")

describe("every public page", () => {
    it("has the pages the site promises", () => {
        expect(PUBLIC).toEqual(expect.arrayContaining([...INDEXABLE, "thanks/index.html", "404.html"]))
    })

    it.each(PUBLIC)("%s links licences, privacy, terms and support from its footer", (file) => {
        const footer = read(file).match(/<footer[\s\S]*<\/footer>/)?.[0] || ""
        for (const href of ["/licences/", "/privacy/", "/terms/", "/pricing/", "mailto:support@scriptural.online"]) expect(footer).toContain(`href="${href}"`)
    })

    it.each(PUBLIC)("%s says nothing to developers and strings no words with dots", (file) => {
        const html = read(file)
        expect(html).not.toMatch(/github|repository|Claude Code|AI agent|command line|developer/i)
        expect(html).not.toContain("·")
    })

    it.each(PUBLIC)("%s loads the consent script after its settings", (file) => {
        const html = read(file)
        expect(html.indexOf('src="/tags-config.js"')).toBeGreaterThan(0)
        expect(html.indexOf('src="/site.js"')).toBeGreaterThan(html.indexOf('src="/tags-config.js"'))
        // no tag is written into a page: they load only from site.js, after Allow
        expect(html).not.toMatch(/googletagmanager|fbevents|analytics\.tiktok/)
    })

    it("keeps tags away from the sign-in and admin pages", () => {
        for (const file of ["signed-in/index.html", "admin/index.html"]) expect(read(file)).not.toContain("site.js")
    })

    it.each(PUBLIC)("%s points only at pages and files that exist", (file) => {
        for (const [, path] of read(file).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
            if (path.startsWith("/download/")) continue
            const target = path.endsWith("/") ? `${path}index.html` : path
            expect(existsSync(join(site, target)), `${file} links ${path}`).toBe(true)
        }
    })
})

describe("search engines (W5, W8)", () => {
    it("has a real not-found page, a sitemap of the indexable pages, and open robots rules", () => {
        expect(read("404.html")).toContain('content="noindex"')
        const sitemap = read("sitemap.xml")
        expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort()).toEqual(INDEXABLE.map(urlOf).sort())
        const robots = read("robots.txt")
        expect(robots).toContain("Sitemap: https://project.scriptural.online/sitemap.xml")
        expect(robots).not.toMatch(/^Disallow: \/$/m)
        expect(read("_headers")).toContain("X-Content-Type-Options: nosniff")
    })

    it.each(INDEXABLE)("%s has one canonical at the address the host serves, and its own description", (file) => {
        const canonicals = [...read(file).matchAll(/rel="canonical" href="([^"]+)"/g)].map((match) => match[1])
        expect(canonicals).toEqual([urlOf(file)])
        const description = (html: string) => html.match(/name="description" content="([^"]+)"/)?.[1]
        expect(INDEXABLE.filter((other) => description(read(other)) === description(read(file)))).toEqual([file])
    })

    it("keeps /thanks out of search results and offers the free app in the structured data", () => {
        expect(read("thanks/index.html")).toContain('content="noindex"')
        const data = JSON.parse(read("index.html").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])
        expect(data.offers).toMatchObject({ "@type": "Offer", price: "0", priceCurrency: "USD" })
    })

    it("shows small hero pictures", () => {
        for (const [, path] of read("index.html").matchAll(/(\/hero\/[a-z]+\.webp)/g)) expect(statSync(join(site, path)).size).toBeLessThan(80_000)
        expect(read("index.html")).not.toContain("/backgrounds/")
    })
})

describe("pricing (W6, E5, trial and refunds)", () => {
    const pricing = read("pricing/index.html")

    it("sells only what the app has, with the real limits", () => {
        expect(pricing).not.toMatch(/GB of media|Five times/i)
        expect(pricing).toContain("1,000 Scriptural AI requests a month")
        expect(pricing).toContain("5,000 Scriptural AI requests a month")
        expect(pricing).toContain("3 people and 500 songs")
    })

    it("states the refund rule, offers the download and answers questions", () => {
        expect(pricing).toContain("Cancel any time in the app. You keep your plan until the end of the period you paid for. Yearly plans are refunded in full within 14 days if you ask.")
        expect(pricing).toContain('href="/download/windows"')
        expect(pricing).toContain("Questions")
        expect(pricing).toContain("The free plan is the trial")
    })
})

describe("licences and the guide", () => {
    it("offers the source beside the downloads, with no repository link (W1)", () => {
        const page = read("licences/index.html")
        expect(page).toContain("GPL-3.0")
        expect(page).toContain("FreeShow")
        expect(page).toContain('href="/download/source"')
    })

    it("names who receives text in the privacy page (W2)", () => {
        const page = read("privacy/index.html")
        for (const name of ["Anthropic", "Google", "Supabase", "Stripe", "audio"]) expect(page).toContain(name)
    })

    it("tells Windows users what to press (R7)", () => {
        expect(read("guide/index.html")).toContain("Windows may say it protected your PC. Choose More info, then Run anyway.")
    })
})

describe("downloads (W4)", () => {
    afterEach(() => vi.unstubAllGlobals())

    const assets = ["Scriptural-Project-1.2.5-arm64.dmg", "Scriptural-Project-1.2.5-x64.dmg", "Scriptural-Project-1.2.5-x64.exe", "Scriptural-Project-1.2.5-x64.exe.blockmap", "Scriptural-Project-1.2.5-arm64.AppImage", "Scriptural-Project-1.2.5-x86_64.AppImage", "scriptural-project-1.2.5-source.tar.gz"]
    const release = () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ assets: assets.map((name) => ({ name, browser_download_url: `https://files.example/${name}` })) }) })
        vi.stubGlobal("fetch", fetch)
        return fetch
    }
    const get = (os: string, next = vi.fn()) => onRequestGet({ params: { os }, next })

    it.each([
        ["mac", "arm64.dmg"],
        ["mac-intel", "x64.dmg"],
        ["windows", "x64.exe"],
        ["linux", "x86_64.AppImage"],
        ["source", "source.tar.gz"]
    ])("sends /download/%s to the newest %s", async (os, ending) => {
        release()
        const response = await get(os)
        expect(response.status).toBe(302)
        expect(response.headers.get("location")).toMatch(new RegExp(`${ending.replace(/\./g, "\\.")}$`))
    })

    it("asks for the release at most every ten minutes", async () => {
        const fetch = release()
        await get("windows")
        expect(fetch.mock.calls[0][1].cf).toEqual({ cacheEverything: true, cacheTtlByStatus: { "200-299": 600, "300-599": 0 } })
    })

    it("lets the site answer an address it does not know", async () => {
        const next = vi.fn().mockResolvedValue("not found page")
        expect(await get("amiga", next)).toBe("not found page")
        expect(await get("__proto__", next)).toBe("not found page")
    })

    it("says so plainly when the file cannot be found", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
        const response = await get("mac")
        expect(response.status).toBe(503)
        expect(await response.text()).toContain("Try again in a minute")
    })

    it("uses plain links in the pages, never a call to the release service from the browser", () => {
        for (const file of PUBLIC) expect(read(file)).not.toContain("api.")
        expect(read("index.html")).toContain('href="/download/mac"')
    })
})

// runs site.js against a minimal page and reports what it loaded and sent
function visit({ tags = {}, choice = null as string | null, path = "/", search = "", ua = "Macintosh" } = {}) {
    const scripts: string[] = []
    const banners: any[] = []
    const listeners: Record<string, (event: any) => void> = {}
    const classes: string[] = []
    const storage = (initial: Record<string, string>) => ({ getItem: (key: string) => initial[key] ?? null, setItem: (key: string, value: string) => (initial[key] = value) })
    const element = (tag: string): any => {
        const node: any = { tag, children: [] as any[], listeners: {} as Record<string, () => void>, setAttribute: () => {}, remove: () => banners.splice(banners.indexOf(node), 1), addEventListener: (type: string, run: () => void) => (node.listeners[type] = run), appendChild: (child: any) => node.children.push(child), append: (...children: any[]) => node.children.push(...children) }
        return node
    }
    const window: any = { SCRIPTURAL_TAGS: tags }
    const context = createContext({
        window,
        navigator: { userAgent: ua, maxTouchPoints: 0 },
        location: { pathname: path, search, reload: () => {} },
        localStorage: storage(choice ? { "scriptural-consent": choice } : {}),
        sessionStorage: storage({}),
        URLSearchParams,
        document: {
            documentElement: { classList: { add: (name: string) => classes.push(name) } },
            head: { appendChild: (node: any) => scripts.push(node.src) },
            body: { appendChild: (node: any) => banners.push(node) },
            createElement: element,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: (type: string, run: (event: any) => void) => (listeners[type] = run)
        }
    })
    runInContext(read("site.js"), context)

    const press = (label: string) => banners[0].children[1].children.find((button: any) => button.textContent === label).listeners.click()
    const download = (os: string) => listeners.click?.({ target: { closest: () => ({ getAttribute: () => `/download/${os}` }) } })
    const events = () => (window.dataLayer || []).map((args: any) => [...args]).filter((args: any[]) => args[0] === "event")
    return { scripts, banners, classes, window, press, download, events }
}

const TAGS = { ga4Id: "G-TEST", googleAdsId: "AW-1", googleAdsPurchaseLabel: "buy", metaPixelId: "123", tiktokPixelId: "T1" }

describe("advertising tags (W3)", () => {
    it("ships with every ID empty, so nothing loads and nobody is asked", () => {
        const window: any = {}
        runInContext(read("tags-config.js"), createContext({ window }))
        expect(Object.values(window.SCRIPTURAL_TAGS).join("")).toBe("")

        const page = visit({ tags: window.SCRIPTURAL_TAGS, choice: "yes" })
        expect(page.scripts).toEqual([])
        expect(page.banners).toEqual([])
    })

    it("loads nothing before Allow", () => {
        const page = visit({ tags: TAGS })
        expect(page.scripts).toEqual([])
        expect(page.banners).toHaveLength(1)
        page.download("windows")
        expect(page.events()).toEqual([])

        page.press("Allow")
        expect(page.scripts).toHaveLength(3)
    })

    it("stays off after No thanks", () => {
        const page = visit({ tags: TAGS })
        page.press("No thanks")
        expect(page.scripts).toEqual([])
        expect(visit({ tags: TAGS, choice: "no" }).banners).toEqual([])
    })

    it("loads only the companies that have an ID", () => {
        const page = visit({ tags: { metaPixelId: "123" }, choice: "yes" })
        expect(page.scripts).toEqual(["https://connect.facebook.net/en_US/fbevents.js"])
    })

    it("counts a download, and not the source file", () => {
        const page = visit({ tags: TAGS, choice: "yes" })
        page.download("windows")
        page.download("source")
        expect(page.events()).toEqual([["event", "download_click", { os: "windows" }]])
    })

    it("counts a purchase on the thank-you page", () => {
        const page = visit({ tags: TAGS, choice: "yes", path: "/thanks/", search: "?price=church_yearly&session_id=cs_1" })
        expect(page.events()).toContainEqual(["event", "purchase", { transaction_id: "cs_1", value: 190, currency: "USD" }])
        expect(page.events()).toContainEqual(["event", "conversion", { send_to: "AW-1/buy", transaction_id: "cs_1", value: 190, currency: "USD" }])
        expect(visit({ tags: TAGS, choice: "yes", path: "/pricing/" }).events()).toEqual([])
    })

    it("offers a phone the link instead of an installer", () => {
        expect(visit({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS)" }).classes).toEqual(["phone"])
        expect(visit({ ua: "Mozilla/5.0 (Windows NT 10.0)" }).classes).toEqual([])
        expect(read("index.html")).toContain("runs on a computer")
        expect(read("index.html")).toContain("Send me the link")
    })
})
