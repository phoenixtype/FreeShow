<script lang="ts">
    import { onMount } from "svelte"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { Main } from "../../../../types/IPC/Main"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { requestMain } from "../../../IPC/main"
    import { activePopup, dictionary, mediaDownloads } from "../../../stores"
    import T from "../../../components/helpers/T.svelte"
    import { newToast } from "../../../utils/common"
    import { translateText } from "../../../utils/language"
    import { downloadPercent } from "../../stt/listenStatus"

    const engine = "nemotron"

    // STATUS

    let status: EngineStatus | null = null
    async function getStatus() {
        const result = await requestMain(Main.AI_GET_STATUS, { engineId: engine })
        status = result?.[engine] || null
        if (status?.error && status.error !== "The local model is missing") newToast(status.error)
    }

    onMount(() => {
        getStatus()
    })

    // DOWNLOADS

    // the whole multi-file download reports under one stable "nemotron" key
    $: modelDownload = $mediaDownloads.get("nemotron")
    $: isModelDownloading = modelDownloadStarted || modelDownload?.status === "downloading"
    $: percent = downloadPercent(modelDownload)

    // NEMOTRON MODEL

    let modelDownloadStarted = false
    let unfinished = false
    async function downloadModel() {
        if (isModelDownloading) return
        modelDownloadStarted = true
        unfinished = false

        const done = await requestMain(Main.AI_SETUP, { action: "download", engineId: "nemotron" }, undefined, 60 * 60 * 1000)
        modelDownloadStarted = false

        await getStatus()
        unfinished = !done && !status?.ready
    }
</script>

{#if !status}
    <div style="display: flex;justify-content: center;padding: 10px;">
        <Loader />
    </div>
{:else if status.unsupported}
    <Tip type="warning" value={status.error} />
{:else if status.ready}
    <div class="row">
        <p><T id="matthias.model_ready" /></p>
        <MaterialButton variant="contained" on:click={() => activePopup.set(null)}><T id="matthias.done" /></MaterialButton>
    </div>
{:else}
    {#if unfinished}
        <p class="problem" role="alert"><T id="matthias.download_unfinished" /></p>
    {/if}
    <div class="row">
        <p>{isModelDownloading ? (percent === null ? translateText("matthias.downloading", $dictionary) : translateText("matthias.downloading_percent", $dictionary, [String(percent)])) : translateText("matthias.model_size", $dictionary)}</p>
        <MaterialButton variant="contained" icon="download" disabled={isModelDownloading} on:click={downloadModel}>{unfinished ? translateText("matthias.try_again", $dictionary) : translateText("matthias.get_model", $dictionary)}</MaterialButton>
    </div>
{/if}

<style>
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }
    .problem {
        margin-block: 6px;
    }
</style>
