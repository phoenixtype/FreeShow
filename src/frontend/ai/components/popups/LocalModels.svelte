<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { sendMain } from "../../../IPC/main"
    import { ai } from "../../../stores"
    import { newToast } from "../../../utils/common"
    import { downloadLocalModel, getOllamaStatus, isModelDownloaded, localModelDownloads, OLLAMA_DOWNLOAD_URL, RECOMMENDED_LOCAL_MODELS } from "../../llm/localModels"

    // "main": the model the copilot uses; "fallback": answers when the main one can't
    export let mode: "main" | "fallback" = "main"

    const dispatch = createEventDispatcher()

    let running: boolean | null = null
    let installed: string[] = []
    async function refresh() {
        const status = await getOllamaStatus()
        running = !!status?.running
        installed = status?.models || []
    }
    onMount(refresh)

    $: chosen = mode === "main" ? $ai.llm?.model || "" : $ai.llm?.localFallback || ""

    function choose(model: string) {
        ai.update((a) => {
            if (!a.llm) a.llm = {}
            if (mode === "main") a.llm.model = model
            else a.llm.localFallback = model
            return a
        })
        dispatch("changed")
    }

    async function download(model: string) {
        const result = await downloadLocalModel(model)
        await refresh()
        if (!result.ok) {
            newToast(result.error || "The model could not be downloaded")
            return
        }
        choose(model)
    }
</script>

{#if running === false}
    <div class="note">
        <p>Free models run on this computer through Ollama: no key, no plan, and nothing leaves the building. Install Ollama, open it, then check again.</p>
        <div class="actions">
            <MaterialButton variant="outlined" icon="launch" on:click={() => sendMain(Main.URL, OLLAMA_DOWNLOAD_URL)} small>Get Ollama</MaterialButton>
            <MaterialButton icon="refresh" on:click={refresh} small>Check again</MaterialButton>
        </div>
    </div>
{:else if running}
    {#if mode === "fallback"}
        <p class="lead">A free model on this computer answers when this one can't: offline, no key, or the plan's allowance used up.</p>
    {/if}

    {#each RECOMMENDED_LOCAL_MODELS as model}
        {@const have = isModelDownloaded(model.id, installed)}
        {@const progress = $localModelDownloads[model.id]}
        <div class="model">
            <div class="text">
                <span class="name">{model.name}</span>
                <span class="detail">{model.note}, {model.size}</span>
            </div>

            {#if progress !== undefined}
                <span class="detail">{progress}%</span>
            {:else if !have}
                <MaterialButton variant="outlined" icon="download" on:click={() => download(model.id)} small>Download</MaterialButton>
            {:else if chosen === model.id}
                <MaterialButton icon="check" on:click={() => mode === "fallback" && choose("")} small>{mode === "main" ? "In use" : "Backup"}</MaterialButton>
            {:else}
                <MaterialButton variant="outlined" on:click={() => choose(model.id)} small>{mode === "main" ? "Use" : "Use as backup"}</MaterialButton>
            {/if}
        </div>
    {/each}
{/if}

<style>
    .note,
    .lead {
        margin: 10px 0;
        opacity: 0.85;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
    }

    .model {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--primary-lighter);
    }

    .text {
        display: flex;
        flex-direction: column;
    }

    .name {
        font-weight: 600;
    }

    .detail {
        font-size: 0.85em;
        opacity: 0.7;
    }
</style>
