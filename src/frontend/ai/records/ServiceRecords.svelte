<!-- What is kept about a service. All of it stays on this computer. -->
<script lang="ts">
    import Title from "../../components/input/Title.svelte"
    import MaterialButton from "../../components/inputs/MaterialButton.svelte"
    import MaterialToggleSwitch from "../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai } from "../../stores"
    import { openDetectionLogs } from "./detectionLog"
</script>

<Title label="Service records" icon="folder" />

{#if $ai.enabled}
    <MaterialToggleSwitch label="Keep a record of what was detected" checked={!!$ai.detectionLog} defaultValue={false} on:change={(e) => ai.update((a) => ({ ...a, detectionLog: e.detail }))} />
    <p class="note">This saves words heard in the meeting on this computer, one file for each service. Files older than 90 days are deleted.</p>
    <div class="actions">
        <MaterialButton variant="outlined" icon="folder" on:click={openDetectionLogs}>Open the records folder</MaterialButton>
    </div>
{/if}

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
        line-height: 1.4;
        white-space: initial;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
        margin: 6px 0;
    }
</style>
