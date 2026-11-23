<script lang="ts">
    import { onDestroy } from "svelte"
    import { activeTimers, outputs, timers } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import Icon from "../../helpers/Icon.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../inputs/MaterialDropdown.svelte"
    import SpeakerProgram from "./SpeakerProgram.svelte"
    import { getCurrentTimerValue } from "./timers"
    import { currentSegment, formatSpeakerTime, NEW_SPEAKER_SCREEN, presetLabel, SPEAKER_PRESETS, SPEAKER_TIMER_ID, speakerScreenChoices, speakerScreens, speakerState } from "./speakerTimer"
    import { addSpeakerTime, playPauseSpeaker, setSpeakerDuration, showSpeakerTimerOn, stopSpeaker } from "./speakerTimerActions"

    export let readOnly = false

    let today = new Date()
    const interval = setInterval(() => (today = new Date()), 250)
    onDestroy(() => clearInterval(interval))

    $: timer = $timers[SPEAKER_TIMER_ID]
    $: total = timer?.start ?? 300
    $: active = $activeTimers.find((a) => a.id === SPEAKER_TIMER_ID)
    $: remaining = timer ? getCurrentTimerValue(timer, { id: SPEAKER_TIMER_ID }, today, $activeTimers) : total
    $: state = speakerState(remaining, total, !!active, !!active?.paused)
    $: running = !!active && !active.paused

    $: segment = currentSegment(timer?.program)

    // the picker is an action, not a setting: show it empty again after each choice
    let pickerKey = 0
    function pickScreen(id: string) {
        showSpeakerTimerOn(id)
        pickerKey++
    }

    $: onScreens = speakerScreens($outputs)
    $: choices = speakerScreenChoices($outputs).filter((a) => !onScreens.includes(a.id))
    $: screenOptions = [...choices.map((a) => ({ value: a.id, label: a.name || translateText("timer.speaker_screen") })), { value: NEW_SPEAKER_SCREEN, label: translateText("timer.new_speaker_screen") }]
    $: onScreenNames = onScreens.map((id) => $outputs[id]?.name || translateText("timer.speaker_screen")).join(", ")
</script>

<section class="speaker {state}">
    <div class="time" role="timer" aria-live="off">
        <span class="digits">{formatSpeakerTime(remaining)}</span>
        <span class="caption">
            {#if state === "overtime"}
                {translateText("timer.overtime")}
            {:else if state === "paused"}
                {translateText("timer.paused")}
            {:else}
                {segment?.name || translateText("timer.speaker")}
            {/if}
        </span>
    </div>

    <div class="controls">
        <div class="row">
            {#each SPEAKER_PRESETS as seconds}
                <MaterialButton small isActive={total === seconds && !active} disabled={readOnly} on:click={() => setSpeakerDuration(seconds)}>{presetLabel(seconds)}</MaterialButton>
            {/each}
        </div>

        <div class="row">
            <MaterialButton variant="outlined" disabled={readOnly} on:click={playPauseSpeaker} title={translateText(running ? "media.pause" : "media.play")}>
                <Icon id={running ? "pause" : "play"} white />
                {translateText(running ? "timer.pause" : active ? "timer.resume" : "timer.start")}
            </MaterialButton>
            <MaterialButton disabled={readOnly} on:click={() => addSpeakerTime(-60)}>{translateText("timer.remove_minute")}</MaterialButton>
            <MaterialButton disabled={readOnly} on:click={() => addSpeakerTime(60)}>{translateText("timer.add_minute")}</MaterialButton>
            <MaterialButton disabled={readOnly || !active} on:click={stopSpeaker} title={translateText("media.stop")}>
                <Icon id="stop" white />
            </MaterialButton>
        </div>

        <div class="row screen">
            <div class="picker">
                {#key pickerKey}
                    <MaterialDropdown label="timer.show_on" value="" options={screenOptions} disabled={readOnly} on:change={(e) => pickScreen(e.detail)} />
                {/key}
            </div>
            <p class="on">
                {#if onScreens.length}
                    <Icon id="stage" size={0.8} white />
                    {translateText("timer.showing_on")}
                    {onScreenNames}
                {:else}
                    {translateText("timer.not_on_screen")}
                {/if}
            </p>
        </div>
    </div>

    <SpeakerProgram {readOnly} />
</section>

<style>
    .speaker {
        display: flex;
        gap: 24px;
        align-items: flex-start;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
    }

    .time {
        display: flex;
        flex-direction: column;
        min-width: 210px;
    }
    .digits {
        font-size: 3.6em;
        line-height: 1;
        letter-spacing: -0.04em;
        font-feature-settings: "tnum" 1;
        font-variant-numeric: tabular-nums;
        color: var(--text);
        transition: color 0.3s;
    }
    .caption {
        margin-top: 6px;
        font-size: 0.85em;
        color: var(--muted-text);
    }

    .warning .digits {
        color: #f5a524;
        animation: soft-flash 1s ease-in-out infinite;
    }
    .overtime .digits,
    .overtime .caption {
        color: var(--disconnected);
        animation: hard-blink 1s steps(1, end) infinite;
    }
    .paused .digits {
        color: var(--muted-text);
    }

    @keyframes soft-flash {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.35;
        }
    }
    @keyframes hard-blink {
        0%,
        49.9% {
            opacity: 1;
        }
        50%,
        100% {
            opacity: 0.25;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .digits,
        .caption {
            animation: none !important;
        }
    }

    .controls {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
    }
    .picker {
        width: 240px;
    }
    .on {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 8px;
        font-size: 0.85em;
        color: var(--muted-text);
    }
</style>
