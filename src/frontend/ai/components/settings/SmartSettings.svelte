<script lang="ts">
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import T from "../../../components/helpers/T.svelte"
    import { ai } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { enableLiveCopilot } from "../../liveCopilot"
    import AutoScriptureOptions from "./AutoScriptureOptions.svelte"
    import ServiceRecords from "../../records/ServiceRecords.svelte"
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

<p class="lead"><T id="matthias.intro" /></p>

{#if isEnabled}
    <STTOptions />

    <MatthiasOptions />

    <AutoScriptureOptions />

    <!-- the model behind the chat and the smarter detection: Scriptural AI, your own key, or free on this computer -->
    <Title label="matthias.smarter_matching" icon="ai" />
    <p class="lead"><T id="matthias.smarter_note" /></p>
    <LlmOptions />
{:else}
    <p class="lead"><T id="matthias.privacy_off" /></p>
{/if}

<ServiceRecords />

<style>
    .lead {
        opacity: 0.8;
        margin: 6px 0 12px;
        line-height: 1.4;
        white-space: initial;
    }
</style>
