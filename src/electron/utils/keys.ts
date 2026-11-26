// API keys and OAuth clients are Scriptural Project's own, written in at build time (scripts/ownKeys.js).
// A name with no key returns "", never another app's key.
import { ownKeys } from "./ownKeys"

export function getKey(type: string) {
    // the protected-file scheme must stay readable across versions
    if (type === "enc_general") return decrypt("11010c5702562601061239102e21550b171b0e0d3b061647")
    if (type === "enc_salt") return decrypt("1600180f43171e07")
    return ownKeys[type] || ""
}

const k = "pcof0erioa"
const decrypt = (v: string) => Array.from({ length: v.length / 2 }, (_, i) => String.fromCharCode(parseInt(v.substring(i * 2, i * 2 + 2), 16) ^ k.charCodeAt(i % k.length))).join("")
