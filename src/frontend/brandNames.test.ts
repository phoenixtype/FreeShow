import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"
import { GUIDE_URL } from "../types/links"

// what a person reads says Scriptural, and help goes to our own guide
const root = join(__dirname, "../..")

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return files(path)
        return /\.(svelte|ts|json|html)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
    })
}

// the upstream name as a word (not part of an identifier), its websites and its issue tracker
const UPSTREAM = /(?<![\w$-])Free[Ss]how(?![\w$-])|[Ff]ree[Ss]how\.(app|net)|github\.com\/ChurchApps\/FreeShow/g

// kept on purpose: the credit, a file format, and addresses of services the app talks to
const ALLOWED: Record<string, RegExp> = {
    "src/frontend/components/main/popups/About.svelte": /FreeShow/i, // the credit to FreeShow
    "src/frontend/converters/bible.ts": /^FreeShow$/, // the name of the .fsb Bible format
    "src/frontend/components/main/popups/ImportScripture.svelte": /^FreeShow$/, // the .fsb format again
    "src/frontend/components/settings/tabs/Files.svelte": /^FreeShow$/, // the data folder already on people's computers
    "src/frontend/utils/checkForUpdates.ts": /^FreeShow$/, // our own release address
    "src/frontend/components/main/popups/Connect.svelte": /freeshow\.net/, // remote control service
    "src/frontend/components/drawer/pages/interactionSlides.ts": /freeshow\.net/, // interaction service
    "src/frontend/components/drawer/pages/InteractionsInfo.svelte": /freeshow\.net/, // interaction service
    "src/frontend/components/export/projectLink.ts": /freeshow\.net/, // shared project links
    "src/frontend/components/drawer/player/YouTubePlayerLite.svelte": /freeshow\.app/, // origin sent to YouTube
    "src/electron/index.ts": /freeshow\.app/, // referer sent to video hosts
    "src/electron/contentProviders/canva/CanvaConnect.ts": /freeshow\.app/, // in a comment beside the redirect
    "src/frontend/utils/analytics.ts": /freeshow\.app/ // page ids sent to analytics (backlog R8)
}

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:"'`\\/])\/\/.*$/gm, "")

it("names no upstream brand or website where a person can see it", () => {
    const found = ["src", "public/lang"]
        .flatMap((dir) => files(join(root, dir)))
        .flatMap((file) => {
            const name = relative(root, file).split("\\").join("/")
            return [...withoutComments(readFileSync(file, "utf8")).matchAll(UPSTREAM)].filter((match) => !ALLOWED[name]?.test(match[0])).map((match) => `${name}: ${match[0]}`)
        })
    expect(found).toEqual([])
})

it("sends help to the Scriptural guide", () => {
    expect(GUIDE_URL).toBe("https://project.scriptural.online/guide/")
    for (const path of ["src/frontend/components/context/menuClick.ts", "src/electron/utils/menuTemplate.ts", "src/frontend/components/quicksearch/quicksearch.ts", "src/frontend/ai/components/popups/AiModelManager.svelte"]) {
        expect(readFileSync(join(root, path), "utf8"), path).toContain("GUIDE_URL")
    }
})

it("has no pink on the sign-in success pages", () => {
    const pages = files(join(root, "src/electron/contentProviders")).filter((file) => readFileSync(file, "utf8").includes("#f0008c"))
    expect(pages).toEqual([])
})
