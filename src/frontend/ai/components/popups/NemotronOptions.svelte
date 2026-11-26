<script lang="ts">
    import { onMount } from "svelte"
    import type { EngineStatus } from "../../../../types/ai/Ai"
    import { Main } from "../../../../types/IPC/Main"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { requestMain } from "../../../IPC/main"
    import { activePopup, mediaDownloads } from "../../../stores"
    import { newToast } from "../../../utils/common"
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
        <p>The speech model is ready.</p>
        <MaterialButton variant="contained" on:click={() => activePopup.set(null)}>Done</MaterialButton>
    </div>
{:else}
    {#if unfinished}
        <p class="problem" role="alert">The download did not finish. Check your internet connection and free disk space, then try again.</p>
    {/if}
    <div class="row">
        <p>{isModelDownloading ? `Downloading${percent === null ? "" : ` ${percent}%`}` : "About 680 MB, downloaded once."}</p>
        <MaterialButton variant="contained" icon="download" disabled={isModelDownloading} on:click={downloadModel}>{unfinished ? "Try again" : "Get the speech model"}</MaterialButton>
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
