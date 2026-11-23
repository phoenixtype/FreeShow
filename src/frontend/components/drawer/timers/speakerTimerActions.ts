import { get } from "svelte/store"
import { OUTPUT } from "../../../../types/Channels"
import type { Event } from "../../../../types/Calendar"
import type { SpeakerProgram, SpeakerSegment } from "../../../../types/Show"
import { activeTimers, events, outputs, stageShows, timers } from "../../../stores"
import { translateText } from "../../../utils/language"
import { send } from "../../../utils/request"
import { enableStageOutput } from "../../helpers/output"
import { updateStageShow } from "../../stage/stage"
import { playPauseGlobal, resetTimer } from "./timers"
import { adjustRemaining, canShowSpeakerTimerOn, emptyProgram, nextOccurrence, SPEAKER_PROGRAM_EVENT_ID, createSpeakerStageLayout, createSpeakerTimer, NEW_SPEAKER_SCREEN, SPEAKER_STAGE_ID, SPEAKER_TIMER_ID, speakerWarnSeconds } from "./speakerTimer"

export function ensureSpeakerTimer(seconds = 300) {
    if (get(timers)[SPEAKER_TIMER_ID]) return
    timers.update((a) => ({ ...a, [SPEAKER_TIMER_ID]: createSpeakerTimer(seconds) }))
}

/** Pick a length. Stops a running speaker timer so the new length starts clean. */
export function setSpeakerDuration(seconds: number) {
    resetTimer(SPEAKER_TIMER_ID)
    timers.update((a) => ({ ...a, [SPEAKER_TIMER_ID]: { ...createSpeakerTimer(seconds), ...keepUserChoices(a[SPEAKER_TIMER_ID]) } }))
}

// colours and name the operator changed in the timer editor survive a new length
function keepUserChoices(timer: any) {
    if (!timer) return {}
    const { name, warnColor, overflowColor, tags, program } = timer
    return Object.fromEntries(Object.entries({ name, warnColor, overflowColor, tags, program }).filter(([, v]) => v !== undefined))
}

export function playPauseSpeaker() {
    ensureSpeakerTimer()
    playPauseGlobal(SPEAKER_TIMER_ID, get(timers)[SPEAKER_TIMER_ID])
}

export function stopSpeaker() {
    resetTimer(SPEAKER_TIMER_ID)
    updateProgram((p) => ({ ...p, index: -1 }))
}

/** +1 / -1 minute. Before it starts this changes the length; while it runs it moves the remaining time. */
export function addSpeakerTime(deltaSeconds: number) {
    const timer = get(timers)[SPEAKER_TIMER_ID]
    if (!timer) return

    const index = get(activeTimers).findIndex((a) => a.id === SPEAKER_TIMER_ID)
    if (index < 0) {
        setSpeakerDuration(Math.max(60, (timer.start || 0) + deltaSeconds))
        return
    }

    let newStart = timer.start || 0
    activeTimers.update((a) => {
        const current = a[index].currentTime ?? newStart
        const next = adjustRemaining(current, deltaSeconds)
        a[index].currentTime = next
        // keep the timer's length at least as long as what is left, so the amber tenth stays right
        if (next > newStart) newStart = next
        a[index].start = newStart
        delete a[index].startTime
        return a
    })

    if (newStart !== timer.start) {
        timers.update((a) => {
            a[SPEAKER_TIMER_ID] = { ...a[SPEAKER_TIMER_ID], start: newStart, warnOffset: speakerWarnSeconds(newStart) }
            return a
        })
    }
}

export function ensureSpeakerStageLayout() {
    if (get(stageShows)[SPEAKER_STAGE_ID]) return
    stageShows.update((a) => ({ ...a, [SPEAKER_STAGE_ID]: createSpeakerStageLayout() }))
}

/**
 * Show the speaker timer on one screen. "new" opens a new speaker screen; otherwise the chosen screen
 * turns into a stage screen with the speaker layout. Refuses the last screen the audience sees.
 * Returns the screen's output id, or "" when refused.
 */
export function showSpeakerTimerOn(outputId: string) {
    if (!canShowSpeakerTimerOn(get(outputs), outputId)) return ""

    ensureSpeakerTimer()
    ensureSpeakerStageLayout()

    if (outputId === NEW_SPEAKER_SCREEN) {
        return enableStageOutput({ stageOutput: SPEAKER_STAGE_ID, name: get(stageShows)[SPEAKER_STAGE_ID]?.name || "Speaker screen" })
    }

    const wasEnabled = !!get(outputs)[outputId]?.enabled
    outputs.update((a) => {
        a[outputId] = { ...a[outputId], stageOutput: SPEAKER_STAGE_ID, enabled: true, active: true }
        return a
    })
    // a stage screen that was switched off needs its window again
    if (!wasEnabled) send(OUTPUT, ["CREATE"], { ...get(outputs)[outputId], id: outputId })
    updateStageShow()

    return outputId
}

// PROGRAM

export function getProgram(): SpeakerProgram {
    return get(timers)[SPEAKER_TIMER_ID]?.program || emptyProgram()
}

export function updateProgram(change: (program: SpeakerProgram) => SpeakerProgram) {
    ensureSpeakerTimer()
    timers.update((a) => {
        a[SPEAKER_TIMER_ID] = { ...a[SPEAKER_TIMER_ID], program: change(a[SPEAKER_TIMER_ID].program || emptyProgram()) }
        return a
    })
}

export function setProgramSegments(segments: SpeakerSegment[]) {
    updateProgram((p) => ({ ...p, segments, index: Math.min(p.index, segments.length - 1) }))
}

/** Play one segment of the program: its length on the timer, counting down straight away. */
export function playSegment(index: number) {
    const program = getProgram()
    const segment = program.segments[index]
    if (!segment) return false

    setSpeakerDuration(segment.seconds)
    updateProgram((p) => ({ ...p, index }))
    playPauseGlobal(SPEAKER_TIMER_ID, get(timers)[SPEAKER_TIMER_ID], true)
    return true
}

export function startProgram() {
    // a scheduled start that has now happened is spent: the event stays in the calendar as a record
    const scheduled = get(events)[SPEAKER_PROGRAM_EVENT_ID]
    if (getProgram().startsAt && (!scheduled || new Date(scheduled.from).getTime() <= Date.now())) updateProgram((p) => ({ ...p, startsAt: undefined }))
    return playSegment(0)
}

/** Next segment, or stop at the end of the program. */
export function nextProgramSegment() {
    const program = getProgram()
    if (!playSegment(program.index + 1)) stopSpeaker()
}

/** Called by the timer tick when the speaker timer reaches zero. */
export function onSpeakerTimerEnd() {
    const program = getProgram()
    if (program.index < 0 || !program.auto) return
    if (program.segments[program.index + 1]) nextProgramSegment()
    // the last segment keeps counting overtime, like a single timer
}

/**
 * Start the program by itself at "HH:MM" (the next time that comes round), through the calendar's action events,
 * so it shows in the calendar and runs with every other scheduled action. Empty time removes it.
 */
export function scheduleProgram(time: string, now = new Date()) {
    const at = time ? nextOccurrence(time, now) : null
    updateProgram((p) => ({ ...p, startsAt: at ? time : undefined }))

    events.update((a) => {
        delete a[SPEAKER_PROGRAM_EVENT_ID]
        if (!at) return a
        const event: Event = {
            type: "action",
            name: translateText("actions.speaker_program_start"),
            color: null,
            from: at.toISOString(),
            to: at.toISOString(),
            time: true,
            repeat: false,
            action: { id: "speaker_program_start", data: {} }
        }
        a[SPEAKER_PROGRAM_EVENT_ID] = event
        return a
    })
    return at
}
