# AI agents and Scriptural Project

The app has its own MCP server, so an AI agent on the same computer can find scripture, build service plans, see the screen and run it.

1. In the app: Settings > Connection > AI agents. Turn it on and copy the command.
2. Paste it in a terminal. For Claude Code:

```bash
claude mcp add --transport http scriptural-project http://127.0.0.1:5507/mcp --header "Authorization: Bearer <token>"
```

The server is off until turned on, answers only this computer, and needs the token.

| Tool | Does |
|---|---|
| `get_live_state`, `get_screen_image` | What is on screen, in words and as a picture |
| `get_transcript`, `show_found`, `set_listening`, `set_agent_mode` | The Live Copilot: what it heard and found |
| `search_bible`, `read_passage`, `show_scripture` | Scripture |
| `list_songs`, `get_song`, `add_song`, `present_song` | The song library |
| `list_plans`, `create_plan`, `add_to_plan` | Service plans |
| `add_media` | Saves a picture, video, PDF or deck, and can show it |
| `control_screen`, `speaker_timer` | Next, previous, clear, lock; the speaker's countdown |

No tool deletes anything. The chat inside the app uses the same tools (`src/frontend/ai/agent/agentTools.ts`).

For an agent that can only start a program (stdio), run `node mcp/server.mjs` with `SCRIPTURAL_PROJECT_TOKEN` set.
