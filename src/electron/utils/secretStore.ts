// Keys and sign-ins are kept encrypted with the computer's own keychain
// (Electron safeStorage). Where a computer has none, they are kept as they were.

import { safeStorage } from "electron"

const SEALED = "sealed:"

export const canSeal = () => safeStorage?.isEncryptionAvailable?.() === true
export const isSealed = (value: string) => value.startsWith(SEALED)

export function seal(text: string): string {
    return canSeal() ? SEALED + safeStorage.encryptString(text).toString("base64") : text
}

/** the text again; a value saved before encryption comes back as it is, "" when it cannot be opened */
export function unseal(value: string): string {
    if (!isSealed(value)) return value
    try {
        return safeStorage.decryptString(Buffer.from(value.slice(SEALED.length), "base64"))
    } catch (err) {
        console.error("Could not open a saved secret:", err)
        return ""
    }
}
