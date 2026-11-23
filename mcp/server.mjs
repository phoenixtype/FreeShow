#!/usr/bin/env node
// MCP server for Scriptural Project. It lets an AI agent find scripture, add
// songs, images and decks, and put them on screen, by driving the app's own
// REST API (Settings > Connection > API) on this computer. Finding things on
// the web is the agent's job: it looks up lyrics or an image, then hands them
// to these tools.
//
// Environment:
//   SCRIPTURAL_PROJECT_URL    the app's REST API, default http://127.0.0.1:5506
//   SCRIPTURAL_PROJECT_TOKEN  the API password, if one is set in the app
//   SCRIPTURAL_PROJECT_MEDIA  folder for added images and decks,
//                             default ~/Documents/Scriptural Project/Media

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { mkdir, copyFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { z } from "zod"

const APP_URL = process.env.SCRIPTURAL_PROJECT_URL || "http://127.0.0.1:5506"
const TOKEN = process.env.SCRIPTURAL_PROJECT_TOKEN || ""
const MEDIA_DIR = process.env.SCRIPTURAL_PROJECT_MEDIA || join(homedir(), "Documents", "Scriptural Project", "Media")

// Scriptural's public scripture search: by wording and by meaning, unmetered.
const SEARCH_URL = "https://sdtusilsfchpryrbmplq.supabase.co/functions/v1/search-scripture"
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVzaWxzZmNocHJ5cmJtcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjU4NzcsImV4cCI6MjA3MTc0MTg3N30.tWnGvQlE2J-1bTmc_u3JDRyIQYJ7vR7jekk6oVtU4QM"

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] })
const failure = (message) => ({ content: [{ type: "text", text: message }], isError: true })

/** Runs one app action. Returns its data, or null for actions that answer nothing. */
async function app(action, data = {}) {
    let response
    try {
        response = await fetch(APP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...data, ...(TOKEN ? { token: TOKEN } : {}) })
        })
    } catch {
        throw new Error(`Scriptural Project is not reachable at ${APP_URL}. Open the app and turn on Settings > Connection > API.`)
    }
    if (response.status === 401) throw new Error("The app refused the API password. Set SCRIPTURAL_PROJECT_TOKEN to the password in Settings > Connection > API.")
    if (response.status === 204) return null
    if (!response.ok) throw new Error(`The app answered ${response.status} to ${action}.`)
    return response.json()
}

const tool = (handler) => async (args) => {
    try {
        return await handler(args)
    } catch (err) {
        return failure(err instanceof Error ? err.message : String(err))
    }
}

const server = new McpServer({ name: "scriptural-project", version: "1.0.0" })

server.registerTool(
    "search_bible",
    {
        description: "Find Bible passages by reference, exact wording, or meaning (\"God loved everyone so much he gave his son\"). Returns references with the verse text.",
        inputSchema: { query: z.string().min(2), version: z.string().default("KJV").describe("Version code for the returned text, e.g. KJV, NKJV, NIV") }
    },
    tool(async ({ query, version }) => {
        const response = await fetch(SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ query, version, limit: 8 })
        })
        if (!response.ok) return failure(`Scripture search answered ${response.status}. Try again.`)
        const { results = [], meaning } = await response.json()
        return text({ searchedByMeaning: !!meaning, results: results.map((r) => ({ reference: r.reference, text: r.text, version: r.version, foundBy: r.match })) })
    })
)

server.registerTool(
    "show_scripture",
    {
        description: "Put a passage on the output screen in the Bible version open in the app, e.g. \"John 3:16\" or \"Romans 8:28-30\".",
        inputSchema: { reference: z.string().min(3) }
    },
    tool(async ({ reference }) => {
        await app("start_scripture", { reference })
        return text(`Showing ${reference}.`)
    })
)

server.registerTool(
    "list_songs",
    {
        description: "List songs and presentations in the library, optionally filtered by words in the name.",
        inputSchema: { filter: z.string().optional() }
    },
    tool(async ({ filter }) => {
        const shows = (await app("get_shows")) || {}
        const needle = filter?.toLowerCase()
        const list = Object.entries(shows)
            .map(([id, show]) => ({ id, name: show.name, category: show.category }))
            .filter((s) => !needle || s.name?.toLowerCase().includes(needle))
        return text({ count: list.length, songs: list.slice(0, 200) })
    })
)

server.registerTool(
    "add_song",
    {
        description: "Add a song to the library. Put a blank line between slides; a line like [Verse 1] or [Chorus] starts a section. Look the lyrics up yourself first, from a source the church may use.",
        inputSchema: { title: z.string().min(1), lyrics: z.string().min(1), category: z.string().default("song") }
    },
    tool(async ({ title, lyrics, category }) => {
        await app("create_show", { name: title, text: lyrics, category })
        return text(`Added "${title}".`)
    })
)

server.registerTool(
    "present_song",
    {
        description: "Open a song or presentation by name and show its first slide.",
        inputSchema: { name: z.string().min(1) }
    },
    tool(async ({ name }) => {
        const shows = (await app("get_shows")) || {}
        const wanted = name.trim().toLowerCase()
        const entries = Object.entries(shows)
        const match = entries.find(([, s]) => s.name?.toLowerCase() === wanted) || entries.find(([, s]) => s.name?.toLowerCase().includes(wanted))
        if (!match) return failure(`No song or presentation named "${name}". Use list_songs to see what is there.`)
        await app("start_show", { id: match[0] })
        return text(`Presenting "${match[1].name}".`)
    })
)

server.registerTool(
    "control_output",
    {
        description: "Move or clear what is on screen.",
        inputSchema: { command: z.enum(["next_slide", "previous_slide", "scripture_next", "scripture_previous", "clear_slide", "clear_all"]) }
    },
    tool(async ({ command }) => {
        await app(command)
        return text(`Done: ${command.replace("_", " ")}.`)
    })
)

server.registerTool(
    "list_projects",
    { description: "List service plans (projects) with their items.", inputSchema: {} },
    tool(async () => text((await app("get_projects")) || {}))
)

server.registerTool(
    "create_project",
    { description: "Create a service plan (project), e.g. \"Sunday 30 November\".", inputSchema: { name: z.string().min(1) } },
    tool(async ({ name }) => {
        await app("create_project", { name })
        return text(`Created "${name}".`)
    })
)

server.registerTool(
    "add_to_project",
    {
        description: "Add a song or presentation (by id from list_songs) to a service plan (by id from list_projects).",
        inputSchema: { projectId: z.string(), showId: z.string() }
    },
    tool(async ({ projectId, showId }) => {
        await app("add_to_project", { projectId, id: showId })
        return text("Added to the plan.")
    })
)

server.registerTool(
    "add_media",
    {
        description: "Add an image, video, PDF or PowerPoint deck to the media folder, from a web address or a file on this computer, and optionally show it now.",
        inputSchema: { source: z.string().min(1).describe("https URL or absolute file path"), name: z.string().optional(), show: z.boolean().default(false) }
    },
    tool(async ({ source, name, show }) => {
        await mkdir(MEDIA_DIR, { recursive: true })
        let target
        if (/^https?:\/\//i.test(source)) {
            const response = await fetch(source)
            if (!response.ok) return failure(`Could not download ${source} (${response.status}).`)
            const fileName = (name || basename(new URL(source).pathname) || "media").replace(/[^\w.\- ]+/g, "_")
            target = join(MEDIA_DIR, fileName)
            await writeFile(target, Buffer.from(await response.arrayBuffer()))
        } else {
            target = join(MEDIA_DIR, name || basename(source))
            await copyFile(source, target)
        }
        if (show) await app("play_media", { path: target })
        return text(`Saved to ${target}${show ? " and showing it" : ""}. Add the folder "${MEDIA_DIR}" under Media once to see everything added here.`)
    })
)

await server.connect(new StdioServerTransport())
