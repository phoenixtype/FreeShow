// Live Copilot: listens to the preacher and puts the scripture on screen.
// One place turns it on, used by the top bar button and the settings switch.

import { get, writable } from "svelte/store"
import { activePage, activePopup, ai, popupData, settingsTab, sttTempDisabled } from "../stores"

// true only while the microphone is really being heard
export const copilotListening = writable(false)

// the panel beside the app, and whether its box to type in should take the cursor
export const copilotOpen = writable(false)
export const focusMatthias = writable(false)

export type CopilotState = "loading" | "inactive" | "error" | "listening" | "processing"
export const copilotState = writable<CopilotState>("inactive")

export function enableLiveCopilot() {
    ai.update((a) => ({ ...a, enabled: true }))
    sttTempDisabled.set(false)
    popupData.set({ mode: "setup" })
    activePopup.set("ai_model_manager")
}

// first use: switch it on and show the settings, where the microphone is picked;
// after that the button opens the copilot itself
export function openLiveCopilot() {
    const settings = get(ai)
    if (!settings.enabled || !settings.stt?.micDeviceId) {
        if (!settings.enabled) enableLiveCopilot()
        settingsTab.set("ai")
        activePage.set("settings")
        return
    }

    copilotOpen.update((open) => !open)
}

/** straight to typing a request, wherever the operator is */
export function askMatthias() {
    if (!get(ai).enabled) return openLiveCopilot()
    copilotOpen.set(true)
    focusMatthias.set(true)
}
