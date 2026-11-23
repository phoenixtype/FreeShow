<script lang="ts">
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import Tip from "../../../components/main/Tip.svelte"
    import { ai } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { enableLiveCopilot } from "../../liveCopilot"
    import AutoScriptureOptions from "./AutoScriptureOptions.svelte"
    import Title from "../../../components/input/Title.svelte"
    import LlmOptions from "../popups/LlmOptions.svelte"
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

{#if isEnabled}
    <STTOptions />

    <AutoScriptureOptions />

    <!-- the model behind the chat and the smarter detection: Scriptural AI, your own key, or free on this computer -->
    <Title label="AI model" icon="ai" />
    <LlmOptions />
{:else}
    <Tip type="info" value="ai.hint" top={20} />
    <Tip type="warning" value="ai.privacy_details" top={10} />
{/if}
