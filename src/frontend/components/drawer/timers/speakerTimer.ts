// The speaker timer: one countdown for whoever is on the platform, shown only on screens the operator picks.
// It is a normal global counter timer and a stage layout, so stage outputs render it and audience outputs never do.
// Pure helpers only (no stores), so the rules below are unit tested.

import type { Output } from "../../../../types/Output"
import type { SpeakerProgram, SpeakerSegment, Timer } from "../../../../types/Show"
import type { StageLayout } from "../../../../types/Stage"

export const SPEAKER_TIMER_ID = "speaker_timer"
export const SPEAKER_STAGE_ID = "speaker_timer_stage"
export const NEW_SPEAKER_SCREEN = "new"

export const SPEAKER_PRESETS = [1, 5, 10, 15, 30, 60].map((minutes) => minutes * 60)

// Same as the Focus timer: amber for the last tenth, red and counting up once it passes zero.
const WARN_COLOR = "#F5A524"
const OVERTIME_COLOR = "#E03E3E"

/** Seconds left when the time turns amber: the last tenth, never under 10 seconds. */
export function speakerWarnSeconds(totalSeconds: number) {
    return Math.max(10, Math.round(totalSeconds / 10))
}

export function createSpeakerTimer(totalSeconds: number, name = "Speaker timer"): Timer {
    const start = Math.max(0, Math.round(totalSeconds))
    return {
        name,
        type: "counter",
        start,
        end: 0,
        warn: true,
        warnOffset: speakerWarnSeconds(start),
        warnColor: WARN_COLOR,
        warnFlash: true,
        overflow: true,
        overflowColor: OVERTIME_COLOR,
        overflowFlash: true
    }
}

/** New remaining time after adding or taking away time. Overtime counts as negative, so +1 min can bring it back. */
export function adjustRemaining(current: number, deltaSeconds: number) {
    return current + deltaSeconds
}

export type SpeakerState = "idle" | "running" | "paused" | "warning" | "overtime"
export function speakerState(remaining: number, totalSeconds: number, active: boolean, paused: boolean): SpeakerState {
    if (!active) return "idle"
    if (remaining < 0) return "overtime"
    if (paused) return "paused"
    if (remaining <= speakerWarnSeconds(totalSeconds)) return "warning"
    return "running"
}

/** "05:00", "-00:42", "1:00:00" */
export function formatSpeakerTime(seconds: number) {
    const negative = seconds < 0
    const abs = Math.abs(Math.round(seconds))
    const h = Math.floor(abs / 3600)
    const m = Math.floor((abs % 3600) / 60)
    const s = abs % 60
    const pad = (n: number) => n.toString().padStart(2, "0")
    const time = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
    return (negative ? "-" : "") + time
}

export function presetLabel(seconds: number) {
    return seconds >= 3600 && seconds % 3600 === 0 ? `${seconds / 3600} hr` : `${Math.round(seconds / 60)} min`
}

// Confidence monitor: the timer large across the top, the slide being shown below as a teleprompter, the clock in the corner.
export function createSpeakerStageLayout(name = "Speaker screen"): StageLayout {
    return {
        name,
        disabled: false,
        password: "",
        settings: { color: "#000000" },
        items: {
            speakerSegment: textItem("{speaker_segment}", "width:930px;height:90px;left:25px;top:15px;color:#bdbdbd;", "text-align: left;"),
            speakerNext: textItem("{speaker_next}", "width:930px;height:90px;left:965px;top:15px;color:#bdbdbd;", "text-align: right;"),
            speakerTimer: {
                type: "timer",
                timer: { id: SPEAKER_TIMER_ID, showHours: false },
                style: "width:1870px;height:460px;left:25px;top:105px;font-weight:bold;color:#ffffff;",
                align: ""
            },
            speakerSlide: {
                type: "slide_text",
                style: "width:1870px;height:400px;left:25px;top:580px;font-weight:bold;font-size:800px;",
                align: ""
            },
            speakerClock: {
                type: "clock",
                clock: { type: "digital", dateFormat: "none", seconds: false },
                style: "width:400px;height:80px;left:1495px;top:990px;color:#bdbdbd;",
                align: "text-align: right;"
            }
        },
        itemOrder: ["speakerSegment", "speakerNext", "speakerTimer", "speakerSlide", "speakerClock"]
    } as StageLayout
}

function textItem(value: string, style: string, align: string) {
    return { type: "text", style, align, textFit: "shrinkToFit", lines: [{ align, text: [{ style: "font-size: 60px;", value }] }] }
}

export interface SpeakerScreenChoice {
    id: string
    name: string
    /** already a stage screen (confidence monitor), or a slide screen that would become one */
    stage: boolean
}

/**
 * Screens the speaker timer may be sent to. Stage screens always qualify.
 * A slide screen qualifies only while another enabled slide screen stays for the audience,
 * so the audience can never lose its slides to the timer.
 */
export function speakerScreenChoices(outputs: { [id: string]: Output }): SpeakerScreenChoice[] {
    const list = Object.entries(outputs).filter(([, output]) => output && !output.invisible)
    const audience = list.filter(([, output]) => output.enabled && !output.stageOutput)

    return list
        .filter(([, output]) => output.stageOutput || (output.enabled && audience.length > 1))
        .map(([id, output]) => ({ id, name: output.name || "", stage: !!output.stageOutput }))
        .sort((a, b) => Number(b.stage) - Number(a.stage) || a.name.localeCompare(b.name))
}

export function canShowSpeakerTimerOn(outputs: { [id: string]: Output }, outputId: string) {
    return outputId === NEW_SPEAKER_SCREEN || speakerScreenChoices(outputs).some((a) => a.id === outputId)
}

/** Screens currently showing the speaker timer. */
export function speakerScreens(outputs: { [id: string]: Output }) {
    return Object.keys(outputs).filter((id) => outputs[id]?.stageOutput === SPEAKER_STAGE_ID)
}

// PROGRAM (run sheet): named segments played in order, like Focus's saved timers with "Next".

export const SPEAKER_PROGRAM_EVENT_ID = "speaker_program_start"

export function emptyProgram(): SpeakerProgram {
    return { segments: [], index: -1, auto: true }
}

/** "Worship 20" / "Sermon 40 min" / "Announcements 5m" / "Offering 2:30" → a segment, or null if no length is given. */
export function parseSegment(text: string, id: string): SpeakerSegment | null {
    const match = text.trim().match(/^(.*?)[\s,-]*(\d+)(?::(\d{1,2}))?\s*(m|min|mins|minutes)?$/i)
    if (!match) return null
    const name = match[1].trim()
    const seconds = Number(match[2]) * 60 + Number(match[3] || 0)
    if (!name || !seconds) return null
    return { id, name, seconds }
}

export function currentSegment(program: SpeakerProgram | undefined) {
    if (!program || program.index < 0) return null
    return program.segments[program.index] || null
}

export function nextSegment(program: SpeakerProgram | undefined) {
    if (!program) return null
    return program.segments[program.index + 1] || null
}

export function programTotalSeconds(program: SpeakerProgram | undefined) {
    return (program?.segments || []).reduce((sum, a) => sum + a.seconds, 0)
}

/** Planned clock time each segment starts, from a start time. */
export function segmentStartTimes(segments: SpeakerSegment[], start: Date) {
    let offset = 0
    return segments.map((segment) => {
        const at = new Date(start.getTime() + offset * 1000)
        offset += segment.seconds
        return at
    })
}

/**
 * The next moment "HH:MM" happens: later today, or tomorrow if that time has passed.
 * With weekdays (0 = Sunday) it is the next of those days instead, so a program can start every Sunday at 10:00.
 */
export function nextOccurrence(time: string, now: Date, days: number[] = []) {
    const [h, m] = time.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    for (let ahead = 0; ahead <= 7; ahead++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, h, m, 0, 0)
        if (at.getTime() <= now.getTime()) continue
        if (!days.length || days.includes(at.getDay())) return at
    }
    return null
}

const REPEAT_WORDS = { every: "Every $1", everyDay: "Every day", and: "and" }

/** "Every Sunday", "Every Sunday and Wednesday", "Every day"; empty for a one-off start. Words come translated from the UI. */
export function repeatLabel(days: number[] = [], dayNames: string[], words = REPEAT_WORDS) {
    if (!days.length) return ""
    if (days.length === 7) return words.everyDay
    const names = [...days].sort((a, b) => a - b).map((d) => dayNames[d])
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${words.and} ${names[names.length - 1]}` : names[0]
    return words.every.replace("$1", list)
}

/** Save the program's segments under a name; the same name replaces the earlier copy. */
export function saveProgramAs(program: SpeakerProgram, name: string, id: string): SpeakerProgram {
    const trimmed = name.trim()
    if (!trimmed || !program.segments.length) return program
    const saved = program.saved || []
    const existing = saved.find((a) => a.name.toLowerCase() === trimmed.toLowerCase())
    const entry = { id: existing?.id || id, name: trimmed, segments: program.segments.map((a) => ({ ...a })) }
    return { ...program, savedId: entry.id, saved: existing ? saved.map((a) => (a.id === entry.id ? entry : a)) : [...saved, entry] }
}

/** Load a saved program's segments, ready to start (the schedule stays as it is). */
export function loadSavedProgram(program: SpeakerProgram, id: string): SpeakerProgram {
    const entry = program.saved?.find((a) => a.id === id)
    if (!entry) return program
    return { ...program, segments: entry.segments.map((a) => ({ ...a })), index: -1, savedId: id }
}

export function deleteSavedProgram(program: SpeakerProgram, id: string): SpeakerProgram {
    return { ...program, saved: (program.saved || []).filter((a) => a.id !== id), savedId: program.savedId === id ? undefined : program.savedId }
}

/** "10:30" in local time, for showing segment start times. */
export function clockLabel(date: Date) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}
