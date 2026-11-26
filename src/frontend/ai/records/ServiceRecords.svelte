<!-- What is kept about a service. All of it stays on this computer. -->
<script lang="ts">
    import Title from "../../components/input/Title.svelte"
    import MaterialButton from "../../components/inputs/MaterialButton.svelte"
    import MaterialDatePicker from "../../components/inputs/MaterialDatePicker.svelte"
    import MaterialToggleSwitch from "../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai, special, usageLog } from "../../stores"
    import { newToast } from "../../utils/common"
    import { saveCcliReport } from "./ccliReport"
    import { openDetectionLogs } from "./detectionLog"
    import { localDay } from "./localDate"
    import { saveRecap } from "./serviceRecap"

    let saving = false
    async function recap() {
        saving = true
        const result = await saveRecap().catch(() => "failed")
        saving = false
        if (result === "empty") newToast("Nothing has been on screen today, so there is nothing to save yet.")
        else if (result === "saved") newToast("Recap saved.")
        else if (result === "failed") newToast("The recap could not be saved. Try another folder.")
    }

    // the last six months, which is how long a CCLI reporting period is
    const today = new Date()
    let from = localDay(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()))
    let to = localDay(today)

    async function report() {
        saving = true
        const result = await saveCcliReport(from, to).catch(() => "failed")
        saving = false
        if (result === "empty") newToast("No songs were counted between those dates.")
        else if (result === "saved") newToast("Report saved.")
        else if (result === "failed") newToast("The report could not be saved. Try another folder.")
    }
</script>

<Title label="Service records" icon="folder" />

<p class="note">The verses and songs shown today, with their times, and any list made of the main points. It covers the time since the app was opened.</p>
<div class="actions">
    <MaterialButton variant="outlined" icon="export" disabled={saving} on:click={recap}>Save today's recap</MaterialButton>
</div>

<MaterialToggleSwitch label="Count the songs used, for a CCLI report" checked={!!$special.logSongUsage} defaultValue={false} on:change={(e) => special.update((a) => ({ ...a, logSongUsage: e.detail }))} />
<p class="note">Songs are counted on this computer from when this is switched on.</p>
{#if $special.logSongUsage || $usageLog.all?.length}
    <MaterialDatePicker label="From" value={from} on:change={(e) => (from = e.detail || from)} />
    <MaterialDatePicker label="To" value={to} on:change={(e) => (to = e.detail || to)} />
    <div class="actions">
        <MaterialButton variant="outlined" icon="export" disabled={saving || from > to} on:click={report}>Save CCLI report</MaterialButton>
    </div>
{/if}

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
