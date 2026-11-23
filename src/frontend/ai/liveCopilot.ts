// Live Copilot: listens to the preacher and puts the scripture on screen.
// One place turns it on, used by the top bar button and the settings switch.

import { get } from "svelte/store"
import { activePage, activePopup, ai, popupData, settingsTab, sttTempDisabled } from "../stores"
import { triggerFunction } from "../utils/common"

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

    triggerFunction("open_live_copilot")
}
