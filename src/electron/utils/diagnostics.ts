// What someone pastes into an email to support: the version, the computer and the
// last things the app wrote to its log. Kept in memory only, and sent by nobody:
// it leaves the computer only if the person pastes it somewhere.

import { format } from "util"

const MAX_LINES = 200
const LEVELS = ["log", "info", "warn", "error", "debug"] as const
const lines: string[] = []

// keys and sign-ins never go into a message
const SECRETS = [/(Bearer\s+)[\w.\-~+/=]+/gi, /()\bsk-[\w-]{8,}/g, /()\bAIza[\w-]{20,}/g, /()\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, /((?:token|password|key|secret)["']?\s*[:=]\s*["']?)[^\s"',}&]{6,}/gi]
const redact = (text: string) => SECRETS.reduce((all, secret) => all.replace(secret, "$1[hidden]"), text)

export function keepLine(level: string, args: unknown[]) {
    const at = new Date().toISOString()
    for (const line of redact(format(...args)).split("\n")) lines.push(`${at} ${level} ${line.slice(0, 500)}`)
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
}

export function captureConsole(target: Console = console) {
    for (const level of LEVELS) {
        const write = target[level].bind(target)
        target[level] = (...args: unknown[]) => {
            keepLine(level, args)
            write(...args)
        }
    }
}

export function diagnosticsText({ version, os }: { version: string; os: string }): string {
    return [`Scriptural Project ${version}`, os, "", ...lines].join("\n")
}
