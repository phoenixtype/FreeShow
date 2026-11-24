#!/usr/bin/env node
// For agents that can only start a program (stdio): passes MCP messages to the server
// inside Scriptural Project. Agents that speak HTTP connect to the app directly and do
// not need this file. No dependencies.
//
//   SCRIPTURAL_PROJECT_TOKEN  from Settings > Connection > AI agents
//   SCRIPTURAL_PROJECT_URL    default http://127.0.0.1:5507/mcp

import { createInterface } from "node:readline"

const URL_ = process.env.SCRIPTURAL_PROJECT_URL || "http://127.0.0.1:5507/mcp"
const TOKEN = process.env.SCRIPTURAL_PROJECT_TOKEN || ""

const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

async function forward(line) {
    let message
    try {
        message = JSON.parse(line)
    } catch {
        return
    }
    const fail = (text) => message.id !== undefined && write({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: text } })
    try {
        const response = await fetch(URL_, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${TOKEN}` },
            body: line,
            signal: AbortSignal.timeout(6 * 60_000)
        })
        if (response.status === 202) return
        const body = await response.json()
        if (response.ok) write(body)
        else fail(body?.error?.message || body?.error || `The app answered ${response.status}.`)
    } catch {
        fail("Scriptural Project is not reachable. Open the app and turn on Settings > Connection > AI agents.")
    }
}

createInterface({ input: process.stdin }).on("line", (line) => line.trim() && forward(line))
