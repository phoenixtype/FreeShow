// The video on screen and the named timers. Everything is done by the app's own actions
// (components/actions/api.ts), the same ones a stream deck or the phone remote use.

import { get } from "svelte/store"
import { API_ACTIONS } from "../../components/actions/api"
import { SPEAKER_TIMER_ID } from "../../components/drawer/timers/speakerTimer"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { VideoPlayer } from "../../components/media/video/videoPlayer"
import { activeTimers, timers } from "../../stores"
import type { AgentTool } from "./agentTools"
import { confirm, requireUnlocked, text, ToolError } from "./toolBasics"

function liveVideo() {
    const output = getFirstActiveOutput()
    const path = output?.out?.background?.path || output?.out?.background?.id || ""
    const state = API_ACTIONS.get_playing_video_state()
    if (!path || !(state.duration > 0)) throw new ToolError("No video is on screen.")
    return { path, outputId: output!.id!, ...state }
}

export const liveTools: AgentTool[] = [
    {
        name: "control_video",
        description: "Play, pause or restart the video on screen, or skip forward or back in it.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["play", "pause", "restart", "forward", "back"] }, seconds: { type: "number", description: "For forward and back; 10 when left out" } }, required: ["command"] },
        screen: true,
        run: async ({ command, seconds }) => {
            requireUnlocked()
            const video = liveVideo()
            if (command === "play" || command === "pause") {
                const paused = command === "pause"
                if (paused) VideoPlayer.pause(video.path, video.outputId)
                else VideoPlayer.play(video.path, video.outputId)
                await confirm(() => API_ACTIONS.get_playing_video_state().paused === paused, paused ? "The video is still playing." : "The video did not start.")
                return paused ? "Paused." : "Playing."
            }
            const step = Number(seconds) > 0 ? Number(seconds) : 10
            const to = command === "restart" ? 0 : Math.round(Math.min(video.duration, Math.max(0, video.time + (command === "forward" ? step : -step))))
            API_ACTIONS.video_seekto({ seconds: to })
            return { at: `${to} seconds of ${Math.round(video.duration)}` }
        }
    },
    {
        name: "control_timer",
        description: "Start, pause or stop one of the church's timers by name, or stop them all. Leave everything out to list them. The speaker's countdown is speaker_timer.",
        inputSchema: { type: "object", properties: { command: { type: "string", enum: ["start", "pause", "stop", "stop_all"] }, name: text("The timer's name") } },
        run: async ({ command, name }) => {
            const named = Object.entries(get(timers))
                .filter(([id, timer]) => timer && id !== SPEAKER_TIMER_ID)
                .map(([id, timer]) => ({ id, name: timer.name || "" }))
            const active = (id: string) => get(activeTimers).find((timer) => timer.id === id)
            if (command === "stop_all") {
                requireUnlocked()
                API_ACTIONS.stop_timers()
                await confirm(() => !get(activeTimers).some((timer) => !timer.pcoLive), "A timer is still running.")
                return "All timers stopped."
            }
            if (!command || !name) return { timers: named.map((timer) => ({ name: timer.name, running: !!active(timer.id) && !active(timer.id).paused })) }

            // the whole name, or the only one holding the words: never the nearest guess
            const wanted = String(name).trim().toLowerCase()
            const holding = named.filter((timer) => timer.name.toLowerCase().includes(wanted))
            const found = named.find((timer) => timer.name.toLowerCase() === wanted) || (holding.length === 1 ? holding[0] : null)
            if (!found) throw new ToolError(`Nothing named "${name}" was found. The timers are: ${named.map((timer) => timer.name).join(", ") || "none yet, add one in the Timers drawer"}.`)

            requireUnlocked()
            if (command === "start") {
                API_ACTIONS.id_start_timer({ id: found.id })
                await confirm(() => !!active(found.id) && !active(found.id).paused, `"${found.name}" did not start. Only a countdown can be started.`)
            } else if (command === "pause") {
                if (!active(found.id)) throw new ToolError(`"${found.name}" is not running.`)
                API_ACTIONS.id_pause_timer({ id: found.id })
                await confirm(() => !!active(found.id)?.paused, `"${found.name}" did not pause.`)
            } else {
                API_ACTIONS.id_stop_timer({ id: found.id })
                await confirm(() => !active(found.id), `"${found.name}" is still running.`)
            }
            return { timer: found.name, done: command }
        }
    }
]
