<script lang="ts">
    import { Main } from "../../../../types/IPC/Main"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { requestMain } from "../../../IPC/main"
    import { AudioMicrophone } from "../../../audio/audioMicrophone"
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { activePopup, ai, dictionary, mediaDownloads, popupData } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import T from "../../../components/helpers/T.svelte"
    import { copilotListening } from "../../liveCopilot"
    import { downloadPercent } from "../../stt/listenStatus"
    import { resolveSttEngine, SPOKEN_LANGUAGES, SpeechToText } from "../../stt/stt"

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

    $: percent = downloadPercent($mediaDownloads.get("nemotron"))

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

    // LANGUAGE

    $: languages = [{ value: "", label: translateText("matthias.same_as_app", $dictionary) }, { value: "auto", label: translateText("matthias.work_out_language", $dictionary) }, ...Object.entries(SPOKEN_LANGUAGES).map(([value, label]) => ({ value, label }))]
    async function updateLanguage(value: string) {
        ai.update((a) => ({ ...a, stt: { ...(a.stt || {}), engineOptions: { ...(a.stt?.engineOptions || {}), [selectedEngine]: { ...(a.stt?.engineOptions?.[selectedEngine] || {}), language: value } } } }))
        // what is listening now was started in the old language
        if ($copilotListening) await SpeechToText.restartEngine()
    }

    // const sttEngines = {
    //     nemotron: { label: "Nemotron" }
    // }
    $: selectedEngine = $ai.stt?.engine || resolveSttEngine()
</script>

<Title label="matthias.listening" icon="microphone" />

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
    <MaterialDropdown label="matthias.microphone" options={microphones} value={options.micDeviceId || ""} on:change={(e) => updateValue("micDeviceId", e.detail)} />
    <MaterialDropdown label="matthias.spoken_language" options={languages} value={options.engineOptions?.[selectedEngine]?.language || ""} on:change={(e) => updateLanguage(e.detail)} />
{:else if currentlyDownloading?.size}
    <p class="note">{percent === null ? translateText("matthias.model_getting", $dictionary) : translateText("matthias.model_getting_percent", $dictionary, [String(percent)])}</p>
{:else}
    <!-- the speech model runs on this computer; it has to be downloaded once before listening -->
    <div class="setup">
        <p class="note">{status?.error || translateText("matthias.model_needed", $dictionary)}</p>
        <MaterialButton variant="contained" icon="download" on:click={getSpeechModel}><T id="matthias.get_model" /></MaterialButton>
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
