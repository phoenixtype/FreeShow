// The Live Copilot on the phone remote: what it is doing, taking the screen back, and
// showing what it found. A phone can never start the microphone or agent mode.

import { get } from "svelte/store"
import { REMOTE } from "../../types/Channels"
import type { ClientMessage } from "../../types/Socket"
import { heldUntil, screenHolder, setAgentMode } from "../ai/agent/control"
import { onScreenTitle } from "../ai/components/floating/onScreen"
import { copilotListening } from "../ai/liveCopilot"
import { NAME } from "../ai/voice/matthias"
import { getFirstActiveOutput } from "../components/helpers/output"
import { ai, aiSuggestions, outLocked, outputs, shows } from "../stores"
import { eachConnection } from "./sendData"

// switching the Bible only moves the operator's own drawer, so it is not offered
const offered = () => get(aiSuggestions).filter((a) => a.action !== "open_scripture" && a.trigger)

export function copilotForPhone() {
    const settings = get(ai)
    if (!settings.enabled) return { on: false }

    const latest = offered()[0]
    const live = onScreenTitle(getFirstActiveOutput()?.out?.slide, get(shows))

    return {
        on: true,
        name: NAME,
        listening: get(copilotListening),
        locked: get(outLocked),
        holder: screenHolder(!!settings.matthias?.agentMode, get(heldUntil), Date.now()),
        suggestion: latest ? { id: latest.id, content: latest.content, onScreen: latest.content.replace(/[–—]/g, "-").toLowerCase() === live.replace(/[–—]/g, "-").toLowerCase() } : null
    }
}

// only these two things can be asked for; anything else just gets the state back
export async function remoteCopilot(msg: ClientMessage) {
    const { action, id } = msg.data || {}

    if (action === "take") setAgentMode(false)
    if (action === "show" && !get(outLocked)) {
        // the same function the computer's Show button runs
        try {
            await offered()
                .find((a) => a.id === id)
                ?.trigger?.()
        } catch (err) {
            console.warn("The phone could not put that up", err)
        }
    }

    msg.data = copilotForPhone()
    return msg
}

/** tells signed-in phones whenever something they see changes */
export function watchCopilotForRemote() {
    let last = ""
    let expiry: ReturnType<typeof setTimeout> | null = null
    const push = () => {
        const state = copilotForPhone()
        const key = JSON.stringify(state)
        if (key === last) return
        last = key
        eachConnection(REMOTE, "COPILOT", (connection: { entered?: boolean }) => (connection.entered ? state : null))
    }

    for (const store of [ai, aiSuggestions, copilotListening, outLocked, outputs]) (store as typeof outLocked).subscribe(push)
    // a hold runs out without anything else changing
    heldUntil.subscribe((until) => {
        if (expiry) clearTimeout(expiry)
        if (until > Date.now()) expiry = setTimeout(push, until - Date.now() + 50)
        push()
    })
}
