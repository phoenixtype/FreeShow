<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { sendMain } from "../../../IPC/main"
    import T from "../../../components/helpers/T.svelte"
    import { ai, dictionary } from "../../../stores"
    import { translateText } from "../../../utils/language"
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

    // with a Church plan this computer is asked first, and Claude when it can't answer
    $: goesFirst = mode === "fallback" && $ai.llm?.provider === "scriptural"

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
            newToast(result.error || translateText("matthias.model_download_failed"))
            return
        }
        choose(model)
    }
</script>

{#if running === false}
    <div class="note">
        <p><T id="matthias.ollama_about" /></p>
        <div class="actions">
            <MaterialButton variant="outlined" icon="launch" on:click={() => sendMain(Main.URL, OLLAMA_DOWNLOAD_URL)} small><T id="matthias.get_ollama" /></MaterialButton>
            <MaterialButton icon="refresh" on:click={refresh} small><T id="matthias.check_again" /></MaterialButton>
        </div>
    </div>
{:else if running}
    {#if mode === "fallback"}
        <p class="lead">
            {#if goesFirst}
                <T id="matthias.goes_first" />
            {:else}
                <T id="matthias.backup_note" />
            {/if}
        </p>
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
                <MaterialButton variant="outlined" icon="download" on:click={() => download(model.id)} small><T id="matthias.download" /></MaterialButton>
            {:else if chosen === model.id}
                <MaterialButton icon="check" on:click={() => mode === "fallback" && choose("")} small>{mode === "main" || goesFirst ? translateText("matthias.in_use", $dictionary) : translateText("matthias.backup", $dictionary)}</MaterialButton>
            {:else}
                <MaterialButton variant="outlined" on:click={() => choose(model.id)} small>{mode === "main" || goesFirst ? translateText("matthias.use", $dictionary) : translateText("matthias.use_as_backup", $dictionary)}</MaterialButton>
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
