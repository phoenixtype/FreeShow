# AI agents and Scriptural Project

The app has its own MCP server, so an AI agent on the same computer can find scripture, build service plans, see the screen and run it.

1. In the app: Settings > Connection > AI agents. Turn it on and copy the command.
2. Paste it in a terminal. For Claude Code:

```bash
claude mcp add --transport http scriptural-project http://127.0.0.1:5507/mcp --header "Authorization: Bearer <token>"
```

The server is off until turned on, answers only this computer, and needs the token.

<!-- tools -->

| Tool | Does | Note |
| --- | --- | --- |
| `get_live_state` | What is on the screen right now (title, words, slide number), whether the screen is locked, the open service plan, and whether the Live Copilot is listening. | Only reads |
| `get_transcript` | The most recent words the Live Copilot heard from the microphone, and the passages or songs it found in them. | Only reads |
| `show_found` | Put one of the Live Copilot's found passages or songs (an id from get_transcript) on screen. |  |
| `set_listening` | Turn the Live Copilot's microphone listening on or off. |  |
| `set_agent_mode` | Let the app lead the screen by itself from what it hears (scripture, songs, clearing up), or hand it back to the operator. | Asks first |
| `search_bible` | Find Bible passages by wording or meaning ("God loved the world so much he gave his son"). | Only reads |
| `read_passage` | The words of a passage in the church's open Bible, without showing it. | Only reads |
| `show_scripture` | Put a passage on screen in the church's open Bible, or in the version named, which then stays open. |  |
| `list_songs` | Songs and presentations in the library, optionally only those with these words in the name. | Only reads |
| `find_song_by_words` | Find songs by a line someone remembers from the words ("how sweet the sound"). | Only reads |
| `get_song` | The words of a song or presentation, slide by slide. | Only reads |
| `add_song` | Add a song to the library. |  |
| `present_song` | Put a song or presentation on screen, from its first slide or a given one. |  |
| `draw_on_screen` | Draw a simple illustration over what is on screen, such as a cross, a path, a bridge or a flow of arrows for what is being preached. |  |
| `clean_up_drawing` | Tidy the drawing on screen, whether the operator drew it by hand or Matthias did: wobble taken out, straight lines made straight, circles made round. |  |
| `clear_drawing` | Remove the drawing from the screen. | Asks first |
| `make_list` | Turn the main points of what was said into a list slide in the library, ready to show. |  |
| `control_screen` | Move or clear what is on screen. | Asks first |
| `list_plans` | Service plans, with what is in each. | Only reads |
| `create_plan` | Create a service plan, such as "Sunday 30 November", and open it. |  |
| `add_to_plan` | Add songs or presentations, a Bible passage, a picture or video, or an overlay (such as a logo) to a service plan, in that order. |  |
| `remove_from_plan` | Take one item off the open service plan. | Asks first |
| `open_plan` | Open a service plan for the operator. |  |
| `show_plan_item` | Put an item of the open plan on screen: "start" for the first, "next", "previous", or its name. |  |
| `show_section` | Go to a part of the song that is on screen: chorus, bridge, verse 2. |  |
| `set_bible_version` | Change the church's open Bible version. |  |
| `show_overlay` | Put one of the church's overlays (a logo, a notice, a timer) on screen, or take it off. |  |
| `show_picture_or_video` | Put one of the church's pictures or videos on screen by name. |  |
| `control_sound` | The sound the app is playing: stop it, mute and unmute it, or change the main volume. |  |
| `open_page` | Take the operator to a page or a library tab of the app. |  |
| `speaker_timer` | The speaker's countdown: start the program, go to its next segment, play and pause it, set it to a number of minutes and start it, or add minutes. |  |
| `control_recording` | Start or stop recording the screen. | Asks first |
| `control_stream` | Start or stop the live stream. | Asks first |
| `control_video` | Play, pause or restart the video on screen, or skip forward or back in it. |  |
| `control_timer` | Start, pause or stop one of the church's timers by name, or stop them all. |  |
| `get_screen_image` | A picture of what a screen shows right now. | Only reads |
| `add_media` | Add a picture, video, sound, PDF or slide deck to the media folder, from a web address or a file on this computer. | Asks first |

<!-- /tools -->

"Asks first" marks a tool that can take something away or cannot be taken back (recording, the live stream, clearing): an agent should have your yes before using it.

No tool deletes a song, a plan or a file. `remove_from_plan` only takes an item off a plan, and Ctrl+Z brings it back. The chat inside the app uses the same tools (`src/frontend/ai/agent/agentTools.ts`).

For an agent that can only start a program (stdio), run `node mcp/server.mjs` with `SCRIPTURAL_PROJECT_TOKEN` set.
