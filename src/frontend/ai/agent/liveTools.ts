// The video on screen, the named timers, recording and the live stream. Everything is done by the app's own actions
// (components/actions/api.ts), the same ones a stream deck or the phone remote use.

import { get } from "svelte/store"
import { API_ACTIONS } from "../../components/actions/api"
import { SPEAKER_TIMER_ID } from "../../components/drawer/timers/speakerTimer"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { hasStreamableDestination } from "../../components/helpers/rtmpDestinations"
import { VideoPlayer } from "../../components/media/video/videoPlayer"
import { activeRecording, activeTimers, obsData, outputs, timers } from "../../stores"
import type { AgentTool } from "./agentTools"
import { confirm, requireUnlocked, text, ToolError } from "./toolBasics"

function liveVideo() {
    const output = getFirstActiveOutput()
    const path = output?.out?.background?.path || output?.out?.background?.id || ""
    const state = API_ACTIONS.get_playing_video_state()
    if (!path || !(state.duration > 0)) throw new ToolError("No video is on screen.")
    return { path, outputId: output!.id!, ...state }
}

/** OBS does what it is asked without answering, so only the connection can be checked */
async function askObs(action: "obs_start_recording" | "obs_stop_recording" | "obs_start_livestream" | "obs_stop_livestream", doing: string) {
    if (!get(obsData).enabled) throw new ToolError("OBS is not turned on. Turn it on in Settings, Connection.")
    await API_ACTIONS[action]()
    if (!get(obsData).connected) throw new ToolError("OBS is not connected. Open OBS and check Settings, Connection.")
    return `Asked OBS to ${doing}. Check OBS to be sure.`
}

const recordingHere = () => !!get(activeRecording)?.isOutput
const screens = () => Object.values(get(outputs))
const streamingHere = () => screens().some((output) => output.rtmpData?.streaming || output.webrtcData?.streaming)

const recordingInput = { type: "object" as const, properties: { command: { type: "string", enum: ["start", "stop"] }, with: { type: "string", enum: ["app", "obs"], description: "Left out: the app, or OBS when that is what is set up or running" } }, required: ["command"] }

export const liveTools: AgentTool[] = [
    {
        name: "control_recording",
        destructive: true,
        description: "Start or stop recording the screen. Only when the operator asks for it in so many words.",
        inputSchema: recordingInput,
        run: async ({ command, with: where }) => {
            if (command === "start") {
                if (where === "obs") return askObs("obs_start_recording", "start recording")
                API_ACTIONS.start_output_recording({})
                await confirm(recordingHere, "Recording did not start. Check that a screen is switched on.", 10_000)
                return "Recording."
            }
            if (where !== "obs" && recordingHere()) {
                API_ACTIONS.stop_output_recording()
                await confirm(() => !recordingHere(), "It is still recording. Stop it from the screen's preview.", 8000)
                return "Recording stopped."
            }
            if (where !== "app" && get(obsData).enabled) return askObs("obs_stop_recording", "stop recording")
            throw new ToolError("Nothing is being recorded here.")
        }
    },
    {
        name: "control_stream",
        destructive: true,
        description: "Start or stop the live stream. Only when the operator asks for it in so many words.",
        inputSchema: recordingInput,
        run: async ({ command, with: where }) => {
            if (command === "start") {
                const rtmp = screens().some((output) => output.rtmp && hasStreamableDestination(output.rtmpData))
                const webrtc = screens().some((output) => output.webrtc && output.webrtcData?.url)
                if (where === "obs" || (!rtmp && !webrtc && where !== "app" && get(obsData).enabled)) return askObs("obs_start_livestream", "go live")
                if (!rtmp && !webrtc) throw new ToolError("No live stream is set up. Add one in Settings, Outputs, or connect OBS in Settings, Connection.")
                if (rtmp) API_ACTIONS.start_rtmp_stream({})
                if (webrtc) API_ACTIONS.start_webrtc_stream({})
                await confirm(streamingHere, "The live stream did not start. Check it in Settings, Outputs.", 10_000)
                return "The live stream is on."
            }
            if (where !== "obs" && streamingHere()) {
                API_ACTIONS.stop_rtmp_stream({})
                API_ACTIONS.stop_webrtc_stream({})
                await confirm(() => !streamingHere(), "It is still streaming. Stop it in Settings, Outputs.", 8000)
                return "The live stream has stopped."
            }
            if (where !== "app" && get(obsData).enabled) return askObs("obs_stop_livestream", "end the stream")
            throw new ToolError("Nothing is streaming from here.")
        }
    },
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
