import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Upstream FreeShow's API keys and OAuth clients were shipped in this fork until R3. They may be used
// only inside FreeShow itself. These are SHA-256 hashes of upstream's ciphertext literals and of their
// plain values, so this test can prove none of them is still shipped without carrying them.
const UPSTREAM_CIPHERTEXT = [
    "dc3870a80bf98bb18439cbead8b074109e9bb593280e02e66c900fa34e56d59f",
    "340433a130170f1e04751f52205f70981f78e7a17500a4e67c6e157bf55759d9",
    "7d0e0a4d10df28a39370be8c03b2c50332787e4f51c534a5d76e3674c9c7b29d",
    "960407da498b935b51d6942d54c6675235af834bd4ffbc2debd751e255188328",
    "7f6ba21991b0488fedd475547a16728afd59911f9d977e81d1965783bb482e42",
    "4624b372482bca2aff93a79a90efebda143b12f835a7ecba16c76f382e7ba1a0",
    "13268f9943f8191437ed2cc935935bb30d3eeb74bafa6b9261e73313b00183e0",
    "d8dcfd63c5377af864f1e83a81c1e6ff116d00a6f9c04bb22d92addc8a72a26d",
    "09fe1664eca8739ba5d0168416364d5eda4c407f125ad56db97c79f0b328f4f0",
    "cbe5e37f2ccc27806e49a8b33a997264304bc1bd9964dbb2beac6c2e44588b6b"
]
const UPSTREAM_PLAIN = [
    "5873956fd240490166a98b1c14df6086781eca32e832962fcbfda012b00ab1af",
    "4006f4c3572d4eadcacff56aaad600fe0ff86dd098ed5d8cad19db9a31808ef0",
    "cff140ae8d04b83efede250895f5da600a9572fbf252cf2f29bad641f7eb42a3",
    "085fb78bca8e9557c9f7d72bbb67470f9996433e419ab0b7fd7f9d5ebe04f075",
    "98cc10da8e2a0c62f30731049db2827b76f87745fbb06004edc0aa096a0d045f",
    "aeba45dfde1aec97b93c127687ab98bdc41a626e3b4dfce6b56825ccfc113934",
    "02f74c9f6305029dc1cd620ced84f1099a640ac11bfc86729c9453ef4c5652cc",
    "9ae8179825e92c5dc3662828585a45f804921fb2e5e437dac3239158522c9d47",
    "ecc99f51fe0c983f090ca3553e7885bff6a7f66fe2bc2aebdf5b4ee73a3ec6b2",
    "ea1a3233b946cb77450e81a95689b6d9c708553ca34f6da8da311157aaaffdc8"
]
const sha = (s: string) => createHash("sha256").update(s).digest("hex")

const root = join(__dirname, "../../..")
const require = createRequire(import.meta.url)
const generator = require(join(root, "scripts/ownKeys.js"))

const KEY_FILES = ["src/electron/utils/keys.ts", "src/electron/utils/ownKeys.ts", "src/frontend/values/keys.ts", "src/frontend/values/ownKeys.ts"]
const KEY_NAMES = ["pixabay", "unsplash", "bibleapi", "pco_id", "pco_secret", "churchApps_id", "churchApps_secret", "amazinglife_id", "canva_id", "canva_secret", "unknown"]

describe("own API keys (R3)", () => {
    it("ships none of upstream's ciphertext in the key files", () => {
        for (const file of KEY_FILES) {
            const text = readFileSync(join(root, file), "utf8")
            for (const [, literal] of text.matchAll(/"([0-9a-f]{20,})"/g)) {
                // the protected-file scheme (enc_general, enc_salt) is kept on purpose
                if (text.slice(text.indexOf(literal) - 40, text.indexOf(literal)).includes("enc_")) continue
                expect(UPSTREAM_CIPHERTEXT, `${file} still has an upstream key`).not.toContain(sha(literal))
            }
        }
    })

    it("returns no upstream value for any key name", async () => {
        const electron = await import("../../electron/utils/keys")
        const frontend = await import("./keys")
        for (const name of KEY_NAMES) {
            for (const value of [electron.getKey(name), frontend.getKey(name)]) {
                expect(typeof value).toBe("string")
                expect(UPSTREAM_PLAIN, `${name} returns an upstream value`).not.toContain(sha(value))
                expect(UPSTREAM_CIPHERTEXT).not.toContain(sha(value))
            }
        }
    })

    it("keeps the committed generated files empty", () => {
        for (const side of ["electron", "frontend"]) {
            const file = side === "electron" ? "src/electron/utils/ownKeys.ts" : "src/frontend/values/ownKeys.ts"
            expect(readFileSync(join(root, file), "utf8")).toBe(generator.render(side, {}, false))
        }
    })

    it("writes keys from the build environment and puts the empty files back", () => {
        const dir = mkdtempSync(join(tmpdir(), "own-keys-"))
        mkdirSync(join(dir, "src/electron/utils"), { recursive: true })
        mkdirSync(join(dir, "src/frontend/values"), { recursive: true })
        generator.writeOwnKeys({ SCRIPTURAL_PIXABAY_KEY: "pix-1", SCRIPTURAL_PCO_CLIENT_ID: "pco-1" }, true, dir)
        const frontend = readFileSync(join(dir, "src/frontend/values/ownKeys.ts"), "utf8")
        const electron = readFileSync(join(dir, "src/electron/utils/ownKeys.ts"), "utf8")
        expect(frontend).toContain('"pixabay": "pix-1"')
        expect(frontend).toContain("keysRequired = true")
        expect(frontend).toContain('"pixabay"')
        expect(frontend).not.toContain("pco-1") // the renderer never needs the Planning Center id
        expect(electron).toContain('"pco_id": "pco-1"')
        // a provider is available only when all of its keys are present
        expect(frontend).toMatch(/ownProviders: string\[\] = \[\s*"pixabay",\s*"planningcenter"\s*\]/)
        generator.resetOwnKeys(dir)
        expect(readFileSync(join(dir, "src/frontend/values/ownKeys.ts"), "utf8")).toBe(generator.render("frontend", {}, false))
    })

    it("lists no provider as available without its keys", () => {
        const text = generator.render("frontend", { SCRIPTURAL_CHURCHAPPS_CLIENT_ID: "only-the-id" }, true)
        expect(text).toContain("ownProviders: string[] = []")
    })

    it("never writes the secret names into source outside the build script", () => {
        const found: string[] = []
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name)
                if (statSync(path).isDirectory()) walk(path)
                else if (/\.(ts|svelte)$/.test(name) && !name.endsWith(".test.ts") && /SCRIPTURAL_[A-Z]+_(KEY|CLIENT)/.test(readFileSync(path, "utf8"))) found.push(path)
            }
        }
        walk(join(root, "src"))
        expect(found).toEqual([])
    })
})
