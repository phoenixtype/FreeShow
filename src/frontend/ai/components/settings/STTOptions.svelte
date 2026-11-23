<script lang="ts">
    import { Main } from "../../../../types/IPC/Main"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { requestMain } from "../../../IPC/main"
    import { AudioMicrophone } from "../../../audio/audioMicrophone"
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { activePopup, ai, mediaDownloads, popupData } from "../../../stores"
    import { resolveSttEngine, SpeechToText } from "../../stt/stt"

    $: options = $ai.stt || {}

    function updateValue(key: string, value: any) {
        ai.update((a) => {
            if (!a.stt) a.stt = {}
            a.stt[key] = value

            return a
        })
    }

    function getSpeechModel() {
        popupData.set({ mode: "setup" })
        activePopup.set("ai_model_manager")
    }

    // STATUS

    let status: EngineStatus | null = null
    $: if (selectedEngine) getStatus()
    async function getStatus() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: selectedEngine })
        status = result?.[selectedEngine] || null

        if (status?.ready) getMicrophones()
    }

    // update status every time a download finishes
    let downloadingCount = 0
    $: currentlyDownloading = $mediaDownloads
    $: if (!status?.ready && currentlyDownloading) {
        if (currentlyDownloading.size < downloadingCount) getStatus()
        downloadingCount = currentlyDownloading.size
    }

    // MICS

    let microphones: { value: string; label: string }[] = []
    function getMicrophones() {
        AudioMicrophone.getList().then(async (devices) => {
            microphones = devices.map((device) => ({ value: device.deviceId, label: device.label }))

            // auto select the SYSTEM default input (the first listed device can be e.g. a continuity iPhone)
            if (!options.micDeviceId && devices.length) {
                const deviceId = await SpeechToText.resolveMicDeviceId("")
                if (deviceId) updateValue("micDeviceId", deviceId)
            }
        })
    }

    // const sttEngines = {
    //     nemotron: { label: "Nemotron" }
    // }
    $: selectedEngine = $ai.stt?.engine || resolveSttEngine()
</script>

<Title label="Listening" icon="microphone" />

<!-- Currently not needed as there's just one engine -->
<!-- <InputRow>
    <MaterialButton
        title="titlebar.edit"
        icon="edit"
        
        on:click={() => {
            popupData.set({ mode: "transcription" })
            activePopup.set("ai_model_manager")
        }}
    >
        <T id="ai.engine" />: <span style="font-weight: bold;">{sttEngines[selectedEngine]?.label}</span>
    </MaterialButton>
</InputRow> -->

{#if status?.ready}
    <MaterialDropdown label="Microphone" options={microphones} value={options.micDeviceId || ""} on:change={(e) => updateValue("micDeviceId", e.detail)} />
{:else if currentlyDownloading?.size}
    <p class="note">Getting the speech model ready. This happens once.</p>
{:else}
    <!-- the speech model runs on this computer; it has to be downloaded once before listening -->
    <div class="setup">
        <p class="note">{status?.error || "Listening needs the speech model on this computer first."}</p>
        <MaterialButton variant="contained" icon="download" on:click={getSpeechModel}>Get the speech model</MaterialButton>
    </div>
{/if}

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
    }
    .setup {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }
</style>
