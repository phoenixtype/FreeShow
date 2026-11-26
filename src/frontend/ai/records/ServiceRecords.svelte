<!-- What is kept about a service. All of it stays on this computer. -->
<script lang="ts">
    import Title from "../../components/input/Title.svelte"
    import MaterialButton from "../../components/inputs/MaterialButton.svelte"
    import MaterialDatePicker from "../../components/inputs/MaterialDatePicker.svelte"
    import MaterialToggleSwitch from "../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai, special, usageLog } from "../../stores"
    import T from "../../components/helpers/T.svelte"
    import { newToast } from "../../utils/common"
    import { translateText } from "../../utils/language"
    import { saveCcliReport } from "./ccliReport"
    import { openDetectionLogs } from "./detectionLog"
    import { localDay } from "./localDate"
    import { saveRecap } from "./serviceRecap"

    let saving = false
    async function recap() {
        saving = true
        const result = await saveRecap().catch(() => "failed")
        saving = false
        if (result === "empty") newToast(translateText("matthias.recap_empty"))
        else if (result === "saved") newToast(translateText("matthias.recap_saved"))
        else if (result === "failed") newToast(translateText("matthias.recap_failed"))
    }

    // the last six months, which is how long a CCLI reporting period is
    const today = new Date()
    let from = localDay(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()))
    let to = localDay(today)

    async function report() {
        saving = true
        const result = await saveCcliReport(from, to).catch(() => "failed")
        saving = false
        if (result === "empty") newToast(translateText("matthias.report_empty"))
        else if (result === "saved") newToast(translateText("matthias.report_saved"))
        else if (result === "failed") newToast(translateText("matthias.report_failed"))
    }
</script>

<Title label="matthias.service_records" icon="folder" />

<p class="note"><T id="matthias.recap_note" /></p>
<div class="actions">
    <MaterialButton variant="outlined" icon="export" disabled={saving} on:click={recap}><T id="matthias.save_recap" /></MaterialButton>
</div>

<MaterialToggleSwitch label="matthias.count_songs" checked={!!$special.logSongUsage} defaultValue={false} on:change={(e) => special.update((a) => ({ ...a, logSongUsage: e.detail }))} />
<p class="note"><T id="matthias.count_note" /></p>
{#if $special.logSongUsage || $usageLog.all?.length}
    <MaterialDatePicker label="matthias.date_from" value={from} on:change={(e) => (from = e.detail || from)} />
    <MaterialDatePicker label="matthias.date_to" value={to} on:change={(e) => (to = e.detail || to)} />
    <div class="actions">
        <MaterialButton variant="outlined" icon="export" disabled={saving || from > to} on:click={report}><T id="matthias.save_ccli" /></MaterialButton>
    </div>
{/if}

{#if $ai.enabled}
    <MaterialToggleSwitch label="matthias.keep_detections" checked={!!$ai.detectionLog} defaultValue={false} on:change={(e) => ai.update((a) => ({ ...a, detectionLog: e.detail }))} />
    <p class="note"><T id="matthias.detections_note" /></p>
    <div class="actions">
        <MaterialButton variant="outlined" icon="folder" on:click={openDetectionLogs}><T id="matthias.open_records" /></MaterialButton>
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
