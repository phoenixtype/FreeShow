<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai } from "../../../stores"
    import { NAME } from "../../voice/matthias"
    import { setAgentMode } from "../../voice/matthiasAgent"

    const update = (key: string, value: any) => ai.update((a) => ({ ...a, matthias: { ...(a.matthias || {}), [key]: value } }))

    const clearOptions = [
        { value: "1", label: "After 1 minute" },
        { value: "2", label: "After 2 minutes" },
        { value: "5", label: "After 5 minutes" },
        { value: "0", label: "Leave it up" }
    ]
    const examples = ["Matthias, John three sixteen", "Matthias, next verse", "Matthias, find the verse about being anxious", "Matthias, another one", "Matthias, read that in the NLT", "Matthias, sing Amazing Grace", "Matthias, clear the screen", "Matthias, take over"]
</script>

<Title label={NAME} icon="ai" />

<MaterialToggleSwitch label="Answer to the name {NAME}" checked={$ai.matthias?.name !== false} on:change={(e) => update("name", e.detail)} />
<MaterialToggleSwitch label="Agent mode: lead the screen by itself" checked={!!$ai.matthias?.agentMode} on:change={(e) => setAgentMode(e.detail)} />
<p class="note">In agent mode it puts up the scripture and songs it is sure of, follows the reading, and clears what is finished. Move anything by hand and it waits half a minute. Lock the screen and it changes nothing.</p>

{#if $ai.matthias?.agentMode}
    <MaterialDropdown label="When the speaker moves on" options={clearOptions} value={String($ai.matthias?.clearAfter ?? 2)} on:change={(e) => update("clearAfter", Number(e.detail))} />
{/if}

{#if $ai.matthias?.name !== false}
    <p class="note">Say the name, then what you want:</p>
    <ul>
        {#each examples as example}<li>{example}</li>{/each}
    </ul>
{/if}

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
        white-space: initial;
        line-height: 1.4;
    }
    ul {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 4px 16px;
        list-style: none;
        margin: 0 0 10px;
        padding: 0;
        opacity: 0.8;
    }
</style>
