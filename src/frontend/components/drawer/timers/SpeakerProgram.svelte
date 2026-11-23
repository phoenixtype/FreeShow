<script lang="ts">
    import { uid } from "uid"
    import { timers } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import Icon from "../../helpers/Icon.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import MaterialTimePicker from "../../inputs/MaterialTimePicker.svelte"
    import MaterialToggleSwitch from "../../inputs/MaterialToggleSwitch.svelte"
    import { clockLabel, emptyProgram, nextOccurrence, parseSegment, presetLabel, programTotalSeconds, segmentStartTimes, SPEAKER_TIMER_ID } from "./speakerTimer"
    import { nextProgramSegment, playSegment, scheduleProgram, setProgramSegments, startProgram, updateProgram } from "./speakerTimerActions"

    export let readOnly = false

    $: program = $timers[SPEAKER_TIMER_ID]?.program || emptyProgram()
    $: segments = program.segments
    $: running = program.index >= 0
    $: plannedStart = program.startsAt ? nextOccurrence(program.startsAt, new Date()) : null
    $: startTimes = plannedStart ? segmentStartTimes(segments, plannedStart) : []

    // remount the box after each segment so it is empty and ready for the next one
    let addKey = 0
    function addSegment(text: string) {
        const segment = parseSegment(text, uid(6))
        if (!segment) return
        setProgramSegments([...segments, segment])
        addKey++
        setTimeout(() => (document.querySelector("section.program .add input") as HTMLInputElement | null)?.focus())
    }

    function removeSegment(id: string) {
        setProgramSegments(segments.filter((a) => a.id !== id))
    }

    function durationLabel(seconds: number) {
        if (seconds % 60) return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")} min`
        const h = Math.floor(seconds / 3600)
        const m = Math.round((seconds % 3600) / 60)
        return h ? `${h} hr${m ? ` ${m} min` : ""}` : presetLabel(seconds)
    }
</script>

<section class="program">
    <div class="head">
        <h4>{translateText("timer.program")}</h4>
        {#if segments.length}<span class="total">{translateText("timer.program_total", null, [durationLabel(programTotalSeconds(program))])}</span>{/if}
        <span class="actions">
            <MaterialButton variant="outlined" small disabled={readOnly || !segments.length} on:click={startProgram}>
                <Icon id="play" white />
                {translateText("timer.start_program")}
            </MaterialButton>
            <MaterialButton small disabled={readOnly || !running} on:click={nextProgramSegment}>
                {translateText("timer.next_segment")}
                <Icon id="next" white />
            </MaterialButton>
        </span>
    </div>

    {#if segments.length}
        <ol>
            {#each segments as segment, i (segment.id)}
                <li class:active={program.index === i} class:done={running && i < program.index}>
                    <button class="segment" disabled={readOnly} on:click={() => playSegment(i)} title={translateText("media.play")}>
                        {#if startTimes[i]}<span class="at">{clockLabel(startTimes[i])}</span>{/if}
                        <span class="name">{segment.name}</span>
                        <span class="length">{durationLabel(segment.seconds)}</span>
                    </button>
                    <MaterialButton disabled={readOnly} on:click={() => removeSegment(segment.id)} title={translateText("timer.remove")}>
                        <Icon id="close" size={0.8} white />
                    </MaterialButton>
                </li>
            {/each}
        </ol>
    {/if}

    <div class="row">
        <div class="add">
            {#key addKey}
                <MaterialTextInput label="timer.add_segment" value="" disabled={readOnly} on:change={(e) => addSegment(e.detail)} />
            {/key}
        </div>
        <div class="time">
            <MaterialTimePicker label="timer.starts_at" value={program.startsAt || ""} disabled={readOnly || !segments.length} on:change={(e) => scheduleProgram(e.detail || "")} />
        </div>
    </div>

    <div class="row">
        <MaterialToggleSwitch small label="timer.auto_next" checked={program.auto} defaultValue={true} disabled={readOnly} on:change={(e) => updateProgram((p) => ({ ...p, auto: e.detail }))} />
    </div>
</section>

<style>
    .program {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 460px;
        flex-shrink: 0;
        margin-left: auto;
    }

    .head {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .actions {
        display: flex;
        gap: 4px;
        margin-left: auto;
    }
    h4 {
        font-size: 0.95em;
        font-weight: 600;
        color: var(--text);
    }
    .total {
        font-size: 0.85em;
        color: var(--muted-text);
    }

    ol {
        list-style: none;
        max-height: 112px;
        overflow-y: auto;
    }
    li {
        display: flex;
        align-items: center;
        border-top: 1px solid var(--border);
    }
    li:last-child {
        border-bottom: 1px solid var(--border);
    }
    .segment {
        flex: 1;
        display: flex;
        gap: 10px;
        align-items: baseline;
        padding: 6px 4px;
        background: none;
        border: none;
        color: var(--text);
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    .segment:hover:not(:disabled) {
        background-color: var(--hover);
    }
    .at,
    .length {
        font-size: 0.85em;
        color: var(--muted-text);
        font-variant-numeric: tabular-nums;
    }
    .name {
        flex: 1;
    }
    li.active .name {
        font-weight: 600;
    }
    li.active {
        box-shadow: inset 2px 0 0 var(--accent);
    }
    li.done .name {
        color: var(--muted-text);
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
    }
    .row {
        flex-wrap: nowrap;
    }
    .add {
        flex: 1;
    }
    .time {
        width: 170px;
    }
</style>
