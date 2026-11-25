<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai, os } from "../../../stores"
    import { NAME } from "../../voice/matthias"
    import { setAgentMode } from "../../agent/control"
    import MatthiasExamples from "../MatthiasExamples.svelte"

    const update = (key: string, value: any) => ai.update((a) => ({ ...a, matthias: { ...(a.matthias || {}), [key]: value } }))

    const shortcut = $os.platform === "darwin" ? "Cmd+J" : "Ctrl+J"
    const clearOptions = [
        { value: "1", label: "After 1 minute" },
        { value: "2", label: "After 2 minutes" },
        { value: "5", label: "After 5 minutes" },
        { value: "0", label: "Leave it up" }
    ]
</script>

<Title label={NAME} icon="ai" />

<MaterialToggleSwitch label="Answer to the name {NAME}" checked={$ai.matthias?.name !== false} on:change={(e) => update("name", e.detail)} />
<MaterialToggleSwitch label="Agent mode: lead the screen by itself" checked={!!$ai.matthias?.agentMode} on:change={(e) => setAgentMode(e.detail)} />
<p class="note">It puts up the scripture and songs it is sure of, follows the reading, and clears what is finished. You can work alongside it: move the screen by hand and it waits half a minute. Lock the screen and it changes nothing.</p>

{#if $ai.matthias?.agentMode}
    <MaterialDropdown label="When the speaker moves on" options={clearOptions} value={String($ai.matthias?.clearAfter ?? 2)} on:change={(e) => update("clearAfter", Number(e.detail))} />
{/if}

{#if $ai.matthias?.name !== false}
    <p class="note">Say “Matthias”, then what you want. Or type it in the panel ({shortcut}).</p>
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
