// Writes our own API keys into the app at build time, from environment variables (GitHub secrets).
// The two generated files are committed empty; preBuild fills them for a production build and
// postBuild empties them again, so keys never end up in git.
const { writeFileSync } = require("fs")
const { join } = require("path")

const ENV = {
    pixabay: "SCRIPTURAL_PIXABAY_KEY",
    unsplash: "SCRIPTURAL_UNSPLASH_KEY",
    bibleapi: "SCRIPTURAL_BIBLEAPI_KEY",
    pco_id: "SCRIPTURAL_PCO_CLIENT_ID",
    pco_secret: "SCRIPTURAL_PCO_CLIENT_SECRET",
    churchApps_id: "SCRIPTURAL_CHURCHAPPS_CLIENT_ID",
    churchApps_secret: "SCRIPTURAL_CHURCHAPPS_CLIENT_SECRET",
    amazinglife_id: "SCRIPTURAL_AMAZINGLIFE_CLIENT_ID"
}

// a provider shows in a production build only when every key it needs is ours
const PROVIDERS = {
    pixabay: ["pixabay"],
    unsplash: ["unsplash"],
    planningcenter: ["pco_id"],
    churchApps: ["churchApps_id", "churchApps_secret"],
    amazinglife: ["amazinglife_id"]
}

// which side of the app reads each key
const SIDES = {
    electron: { file: "src/electron/utils/ownKeys.ts", names: ["pco_id", "pco_secret", "churchApps_id", "churchApps_secret", "amazinglife_id"] },
    frontend: { file: "src/frontend/values/ownKeys.ts", names: ["pixabay", "unsplash", "bibleapi"] }
}

const value = (env, name) => (env[ENV[name]] || "").trim()

function render(side, env, production) {
    const keys = {}
    SIDES[side].names.forEach((name) => {
        if (value(env, name)) keys[name] = value(env, name)
    })

    let text = "// Filled at build time by scripts/ownKeys.js from GitHub secrets. Empty in the repository.\n"
    text += `export const ownKeys: Record<string, string> = ${JSON.stringify(keys, null, 4)}\n`

    if (side === "frontend") {
        const available = Object.keys(PROVIDERS).filter((id) => PROVIDERS[id].every((name) => value(env, name)))
        text += `export const ownProviders: string[] = ${JSON.stringify(available, null, 4)}\n`
        text += `export const keysRequired = ${production === true}\n`
    }
    return text
}

function writeOwnKeys(env, production, root = join(__dirname, "..")) {
    Object.keys(SIDES).forEach((side) => writeFileSync(join(root, SIDES[side].file), render(side, env, production)))
}

function resetOwnKeys(root = join(__dirname, "..")) {
    writeOwnKeys({}, false, root)
}

module.exports = { ENV, render, writeOwnKeys, resetOwnKeys }

if (require.main === module) resetOwnKeys()
