<script lang="ts">
    import type { AIProviderId, EngineStatus } from "../../../../types/ai/Ai"
    import { Main } from "../../../../types/IPC/Main"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialTextInput from "../../../components/inputs/MaterialTextInput.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Loader from "../../../components/main/Loader.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import T from "../../../components/helpers/T.svelte"
    import { requestMain } from "../../../IPC/main"
    import { ai, dictionary } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { newToast } from "../../../utils/common"
    import { llmSession } from "../../llm/llmSession"
    import LocalModels from "./LocalModels.svelte"

    $: llmOptions = $ai.llm || {}

    function updateLlmOption(key: string, value: any) {
        ai.update((a) => {
            if (!a.llm) a.llm = {}
            a.llm[key] = value
            return a
        })
    }

    $: providerOptions = [
        { value: "none", label: translateText("matthias.provider_off", $dictionary) },
        { value: "scriptural", label: translateText("matthias.provider_scriptural", $dictionary) },
        { value: "anthropic", label: translateText("matthias.provider_anthropic", $dictionary) },
        { value: "google", label: translateText("matthias.provider_google", $dictionary) },
        { value: "openai", label: translateText("matthias.provider_openai", $dictionary) },
        { value: "ollama", label: translateText("matthias.provider_ollama", $dictionary) }
    ]

    $: provider = (llmOptions.provider || "none") as AIProviderId | "none"

    // DYNAMIC MODEL FETCHING
    let fetchedModels: { id: string; name: string; recommended?: boolean }[] = []
    let loadingModels = false

    $: if (provider && provider !== "none" && provider !== "scriptural") fetchModelsForProvider(provider)
    else fetchedModels = []

    async function fetchModelsForProvider(currentProvider: AIProviderId) {
        loadingModels = true
        try {
            const result = await requestMain(Main.AI_GET_MODELS, { providerId: currentProvider })
            if (result && Array.isArray(result) && result.length > 0) {
                fetchedModels = result
            } else {
                fetchedModels = []
            }
        } catch (e) {
            fetchedModels = []
        } finally {
            loadingModels = false
        }
    }

    $: activeModelList = fetchedModels.length > 0 ? fetchedModels : []

    $: modelOptions = activeModelList.map((model) => ({ value: model.id, label: model.name }))
    $: storedModel = llmOptions.model || ""
    $: defaultModel = (activeModelList.find((model) => model.recommended) || activeModelList[0])?.id || ""
    $: selectedModel = activeModelList.find((model) => model.id === storedModel) ? storedModel : defaultModel

    function setProvider(id: string) {
        updateLlmOption("provider", id)
        updateLlmOption("model", "")
        keyInput = ""
    }

    // STATUS

    let status: { [key: string]: EngineStatus } | null = null
    $: if (provider) getStatus()
    async function getStatus() {
        if (!provider || provider === "none" || provider === "scriptural") return
        if (!storedModel) return

        const result = await requestMain(Main.AI_GET_STATUS, { engineId: provider })
        status = result || null
        const error = status?.[provider]?.error
        if (error) newToast(error)
    }

    // API KEY

    let keyInput = ""
    function updateKey(e: any) {
        keyInput = e.detail

        saveKey()
    }

    async function saveKey() {
        if (!keyInput || provider === "none" || provider === "ollama") return

        const isValid = await requestMain(Main.AI_SET_KEY, { providerId: provider, key: keyInput })
        if (!isValid) {
            keyInput = ""
            newToast(translateText("matthias.key_refused"))
            return
        }

        getStatus()
        llmSession.refreshConfig()
        fetchModelsForProvider(provider)
    }

    // an empty key takes the saved one away
    async function removeKey() {
        if (provider === "none" || provider === "ollama") return
        await requestMain(Main.AI_SET_KEY, { providerId: provider, key: "" })
        keyInput = ""
        status = null
        llmSession.refreshConfig()
        fetchedModels = []
        newToast(translateText("matthias.key_removed"))
    }
</script>

<MaterialDropdown label="matthias.ai_model" options={providerOptions} value={provider} on:change={(e) => setProvider(e.detail)} />

{#if provider === "none"}
    <!-- explicitly no LLM - detection runs on speech-to-text alone -->
{:else if provider === "scriptural"}
    <p style="opacity: 0.8;margin: 10px 0;"><T id="matthias.included_plan" /></p>
{:else if provider === "ollama"}
    <!-- no API key: everything runs on the local ollama server -->
    <LocalModels mode="main" on:changed={() => fetchModelsForProvider("ollama")} />
{:else}
    <Tip type="warning" value="ai.privacy_cloud" top={10} bottom={10} />

    <MaterialTextInput label="ai.api_key" value={keyInput} type="password" pasteBtn on:change={updateKey} />
    <div class="removeKey">
        <MaterialButton variant="text" small on:click={removeKey}><T id="matthias.remove_key" /></MaterialButton>
    </div>
{/if}

{#if provider !== "none" && provider !== "scriptural"}
    <div class="modelSelectRow">
        <MaterialDropdown label="ai.model" options={modelOptions} value={selectedModel} defaultValue={defaultModel} disabled={loadingModels || !!status?.[provider]?.error} on:change={(e) => updateLlmOption("model", e.detail)} />

        {#if loadingModels}
            <span class="inlineLoader"><Loader size={0.9} /></span>
        {/if}
    </div>
{/if}

{#if provider !== "none" && provider !== "ollama"}
    <p class="backupTitle">{provider === "scriptural" ? translateText("matthias.local_first", $dictionary) : translateText("matthias.local_fallback", $dictionary)}</p>
    <LocalModels mode="fallback" />
{/if}

<style>
    .removeKey {
        display: flex;
        justify-content: flex-end;
    }

    .backupTitle {
        margin-top: 20px;
        font-weight: 600;
    }

    .modelSelectRow {
        position: relative;
        display: flex;
        align-items: center;
    }
    .inlineLoader {
        position: absolute;
        right: 10px;
    }
</style>
