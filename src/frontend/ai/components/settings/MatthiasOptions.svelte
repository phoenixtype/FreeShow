<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import T from "../../../components/helpers/T.svelte"
    import { ai, dictionary, os } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { NAME } from "../../voice/matthias"
    import { askingToLead, setAgentMode } from "../../agent/control"
    import AgentConfirm from "../floating/AgentConfirm.svelte"
    import MatthiasExamples from "../MatthiasExamples.svelte"

    const update = (key: string, value: any) => ai.update((a) => ({ ...a, matthias: { ...(a.matthias || {}), [key]: value } }))

    const shortcut = $os.platform === "darwin" ? "Cmd+J" : "Ctrl+J"
    $: clearOptions = [
        { value: "1", label: translateText("matthias.after_1_minute", $dictionary) },
        { value: "2", label: translateText("matthias.after_2_minutes", $dictionary) },
        { value: "5", label: translateText("matthias.after_5_minutes", $dictionary) },
        { value: "0", label: translateText("matthias.leave_up", $dictionary) }
    ]
</script>

<Title label={NAME} icon="ai" />

<MaterialToggleSwitch label={translateText("matthias.answer_to_name", $dictionary, [NAME])} checked={$ai.matthias?.name !== false} on:change={(e) => update("name", e.detail)} />
<MaterialToggleSwitch label="matthias.agent_mode_setting" checked={!!$ai.matthias?.agentMode || $askingToLead} on:change={(e) => setAgentMode(e.detail)} />
{#if $askingToLead}
    <AgentConfirm />
{/if}
<p class="note"><T id="matthias.agent_note" /></p>

{#if $ai.matthias?.agentMode}
    <MaterialDropdown label="matthias.speaker_moves_on" options={clearOptions} value={String($ai.matthias?.clearAfter ?? 2)} on:change={(e) => update("clearAfter", Number(e.detail))} />
{/if}

{#if $ai.matthias?.name !== false}
    <p class="note"><T id="matthias.say_name" replace={[NAME, shortcut]} /></p>
    <MatthiasExamples />
{/if}

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
        white-space: initial;
        line-height: 1.4;
    }
</style>
