<script lang="ts">
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { enableLiveCopilot } from "../../liveCopilot"
    import AutoScriptureOptions from "./AutoScriptureOptions.svelte"
    import Title from "../../../components/input/Title.svelte"
    import LlmOptions from "../popups/LlmOptions.svelte"
    import MatthiasOptions from "./MatthiasOptions.svelte"
    import STTOptions from "./STTOptions.svelte"

    $: isEnabled = $ai.enabled

    function updateValue(key: string, value: any) {
        ai.update((a) => {
            a[key] = value
            return a
        })

        if (key === "enabled" && value) enableLiveCopilot()
    }
</script>

<MaterialToggleSwitch label={translateText("actions.enable_specific", null, ["settings.ai"])} checked={isEnabled} on:change={(e) => updateValue("enabled", e.detail)} />

<p class="lead">Listens to the preacher and the singing, and offers the scripture and songs it hears. You choose whether it asks first or puts them up itself.</p>

{#if isEnabled}
    <STTOptions />

    <MatthiasOptions />

    <AutoScriptureOptions />

    <!-- the model behind the chat and the smarter detection: Scriptural AI, your own key, or free on this computer -->
    <Title label="Smarter matching (optional)" icon="ai" />
    <p class="lead">An AI model catches passages described in the preacher's own words, and answers questions in the chat.</p>
    <LlmOptions />
{:else}
    <p class="lead">Speech is turned into text on this computer. Nothing leaves it unless you pick an online AI model.</p>
{/if}

<style>
    .lead {
        opacity: 0.8;
        margin: 6px 0 12px;
        line-height: 1.4;
        white-space: initial;
    }
</style>
