# Scriptural Project MCP server

Lets an AI agent (Claude and others) run Scriptural Project on the same computer: find scripture, add songs, images and decks, build service plans and present.

1. In the app, turn on Settings > Connection > API. Set a password there if others share the network.
2. `cd mcp && npm install`
3. Add the server to the agent. For Claude Code:

```bash
claude mcp add scriptural-project -e SCRIPTURAL_PROJECT_TOKEN=<api password> -- node /path/to/FreeShow/mcp/server.mjs
```

| Tool | Does |
|---|---|
| `search_bible` | Finds passages by reference, wording or meaning (Scriptural's search) |
| `show_scripture` | Puts a passage on screen |
| `list_songs`, `add_song`, `present_song` | The song library |
| `list_projects`, `create_project`, `add_to_project` | Service plans |
| `add_media` | Saves an image, video, PDF or deck from a URL or file into the media folder |
| `control_output` | Next, previous, clear |

The agent finds lyrics, images and decks on the web itself and passes them in. Settings: `SCRIPTURAL_PROJECT_URL` (default `http://127.0.0.1:5506`), `SCRIPTURAL_PROJECT_TOKEN`, `SCRIPTURAL_PROJECT_MEDIA`.
