// Makes site/scriptural-project-guide.pdf from the guide page, so the download
// is always the same words as /guide. Run after editing site/guide/index.html:
//   node scripts/site/build-guide-pdf.mjs
import { chromium } from "@playwright/test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join } from "node:path"

const site = join(dirname(fileURLToPath(import.meta.url)), "../../site")
// CHROMIUM_PATH: an installed Chromium to use when Playwright's own download is not there
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage()
await page.emulateMedia({ media: "print", colorScheme: "light" })
await page.goto(pathToFileURL(join(site, "guide/index.html")).href)
await page.pdf({ path: join(site, "scriptural-project-guide.pdf"), format: "A4", margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true })
await browser.close()
console.log("wrote site/scriptural-project-guide.pdf")
