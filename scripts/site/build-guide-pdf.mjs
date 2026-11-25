// Makes site/scriptural-project-guide.pdf from the guide page, so the download
// is always the same words as /guide. Run after editing site/guide/index.html:
//   node scripts/site/build-guide-pdf.mjs
import { chromium } from "@playwright/test"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, extname, join } from "node:path"

const site = join(dirname(fileURLToPath(import.meta.url)), "../../site")
// CHROMIUM_PATH: an installed Chromium to use when Playwright's own download is not there
// the page links its logo and fonts from the site root (/icon.png), so it is served from a
// local server, not opened as a file, where those links point at the disk root and break
const types = { ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".ico": "image/x-icon" }
const server = createServer(async (req, res) => {
    let path = decodeURIComponent((req.url || "/").split("?")[0])
    if (path.endsWith("/")) path += "index.html"
    const file = join(site, path)
    if (!file.startsWith(site)) return res.writeHead(403).end()
    try {
        res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" }).end(await readFile(file))
    } catch {
        res.writeHead(404).end()
    }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage()
await page.emulateMedia({ media: "print", colorScheme: "light" })
await page.goto(`http://127.0.0.1:${server.address().port}/guide/`, { waitUntil: "networkidle" })
await page.pdf({ path: join(site, "scriptural-project-guide.pdf"), format: "A4", margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true })
await browser.close()
server.close()
console.log("wrote site/scriptural-project-guide.pdf")
