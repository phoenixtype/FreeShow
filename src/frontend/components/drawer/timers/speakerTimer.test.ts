import { describe, expect, it } from "vitest"
import type { Output } from "../../../../types/Output"
import { RenderGroups } from "../../../../electron/output/helpers/RenderGroups"
import { adjustRemaining, clockLabel, deleteSavedProgram, loadSavedProgram, repeatLabel, saveProgramAs, currentSegment, nextOccurrence, nextSegment, parseSegment, programTotalSeconds, segmentStartTimes, canShowSpeakerTimerOn, createSpeakerStageLayout, createSpeakerTimer, formatSpeakerTime, NEW_SPEAKER_SCREEN, SPEAKER_STAGE_ID, SPEAKER_TIMER_ID, speakerScreenChoices, speakerScreens, speakerState, speakerWarnSeconds } from "./speakerTimer"

const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
function output(name: string, extra: Partial<Output> = {}): Output {
    return { name, enabled: true, active: true, color: "#fff", bounds, screen: null, ...extra }
}

describe("speaker timer", () => {
    it("counts down and keeps going past zero, amber in the last tenth", () => {
        const timer = createSpeakerTimer(600)
        expect(timer).toMatchObject({ type: "counter", start: 600, end: 0, overflow: true, warn: true, warnOffset: 60, overflowFlash: true })
    })

    it("turns amber no later than 10 seconds before the end", () => {
        expect(speakerWarnSeconds(60)).toBe(10)
        expect(speakerWarnSeconds(3600)).toBe(360)
    })

    it("reads running, warning, paused and overtime like the Focus timer", () => {
        expect(speakerState(300, 300, false, false)).toBe("idle")
        expect(speakerState(200, 300, true, false)).toBe("running")
        expect(speakerState(30, 300, true, false)).toBe("warning")
        expect(speakerState(30, 300, true, true)).toBe("paused")
        expect(speakerState(-5, 300, true, false)).toBe("overtime")
        expect(speakerState(-5, 300, true, true)).toBe("overtime")
    })

    it("shows overtime as a count up with a minus sign", () => {
        expect(formatSpeakerTime(300)).toBe("05:00")
        expect(formatSpeakerTime(-42)).toBe("-00:42")
        expect(formatSpeakerTime(3600)).toBe("1:00:00")
    })

    it("lets +1 min bring a speaker back from overtime", () => {
        expect(adjustRemaining(-20, 60)).toBe(40)
        expect(adjustRemaining(30, -60)).toBe(-30)
    })

    it("lays out the timer and the current slide text for the speaker", () => {
        const layout = createSpeakerStageLayout()
        const items = Object.values(layout.items)
        expect(items.find((a) => a.type === "timer")?.timer?.id).toBe(SPEAKER_TIMER_ID)
        expect(items.some((a) => a.type === "slide_text" && !a.slideOffset)).toBe(true)
    })
})

describe("one screen only", () => {
    it("never offers the only audience screen", () => {
        const outputs = { a: output("Main") }
        expect(speakerScreenChoices(outputs)).toEqual([])
        expect(canShowSpeakerTimerOn(outputs, "a")).toBe(false)
        expect(canShowSpeakerTimerOn(outputs, NEW_SPEAKER_SCREEN)).toBe(true)
    })

    it("offers a second slide screen while another stays for the audience", () => {
        const outputs = { a: output("Main"), b: output("Confidence") }
        expect(speakerScreenChoices(outputs).map((a) => a.id)).toEqual(["b", "a"])

        // once one of them shows the timer, the other is the last audience screen and is no longer offered
        const after = { ...outputs, b: { ...outputs.b, stageOutput: SPEAKER_STAGE_ID } }
        expect(speakerScreenChoices(after).map((a) => a.id)).toEqual(["b"])
        expect(canShowSpeakerTimerOn(after, "a")).toBe(false)
        expect(speakerScreens(after)).toEqual(["b"])
    })

    it("offers stage screens first, even switched off", () => {
        const outputs = { a: output("Main"), s: output("Stage", { stageOutput: "default", enabled: false }) }
        expect(speakerScreenChoices(outputs)).toEqual([{ id: "s", name: "Stage", stage: true }])
    })

    it("keeps the speaker screen on its own render even on the same screen and NDI source", () => {
        const audience = output("Main", { ndi: true })
        const speaker = output("Speaker screen", { ndi: true, stageOutput: SPEAKER_STAGE_ID })
        expect(RenderGroups.computeKey(audience)).not.toBe(RenderGroups.computeKey(speaker))
    })
})

describe("program", () => {
    it("reads a segment from plain words", () => {
        expect(parseSegment("Worship 20", "a")).toEqual({ id: "a", name: "Worship", seconds: 1200 })
        expect(parseSegment("Sermon - 40 min", "b")).toEqual({ id: "b", name: "Sermon", seconds: 2400 })
        expect(parseSegment("Offering 2:30", "c")).toEqual({ id: "c", name: "Offering", seconds: 150 })
        expect(parseSegment("Psalm 23 reading 5m", "d")).toEqual({ id: "d", name: "Psalm 23 reading", seconds: 300 })
        expect(parseSegment("Worship", "e")).toBeNull()
        expect(parseSegment("20", "f")).toBeNull()
    })

    const segments = [
        { id: "a", name: "Worship", seconds: 1200 },
        { id: "b", name: "Announcements", seconds: 300 },
        { id: "c", name: "Sermon", seconds: 2400 }
    ]

    it("knows the segment playing and the one after it", () => {
        const program = { segments, index: 1, auto: true }
        expect(currentSegment(program)?.name).toBe("Announcements")
        expect(nextSegment(program)?.name).toBe("Sermon")
        expect(nextSegment({ ...program, index: 2 })).toBeNull()
        expect(currentSegment({ ...program, index: -1 })).toBeNull()
        expect(nextSegment({ ...program, index: -1 })?.name).toBe("Worship")
        expect(programTotalSeconds(program)).toBe(3900)
    })

    it("plans each segment's clock time from the start", () => {
        const start = new Date(2026, 10, 29, 10, 0)
        expect(segmentStartTimes(segments, start).map(clockLabel)).toEqual(["10:00", "10:20", "10:25"])
    })

    it("starts later today, or tomorrow once the time has passed", () => {
        const now = new Date(2026, 10, 29, 9, 30)
        expect(nextOccurrence("10:00", now)).toEqual(new Date(2026, 10, 29, 10, 0))
        expect(nextOccurrence("09:00", now)).toEqual(new Date(2026, 10, 30, 9, 0))
        expect(nextOccurrence("", now)).toBeNull()
    })
})

describe("reusing a program", () => {
    // Sunday 29 November 2026
    const sunday = new Date(2026, 10, 29, 9, 30)

    it("repeats on chosen weekdays", () => {
        expect(nextOccurrence("10:00", sunday, [0])).toEqual(new Date(2026, 10, 29, 10, 0))
        // after this Sunday's start, the next is the following Sunday
        expect(nextOccurrence("10:00", new Date(2026, 10, 29, 10, 0), [0])).toEqual(new Date(2026, 11, 6, 10, 0))
        // Sunday and Wednesday: from Sunday noon the next is Wednesday
        expect(nextOccurrence("19:00", new Date(2026, 10, 29, 20, 0), [0, 3])).toEqual(new Date(2026, 11, 2, 19, 0))
    })

    it("says when it repeats", () => {
        const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        expect(repeatLabel([], names)).toBe("")
        expect(repeatLabel([0], names)).toBe("Every Sunday")
        expect(repeatLabel([3, 0], names)).toBe("Every Sunday and Wednesday")
        expect(repeatLabel([0, 1, 2, 3, 4, 5, 6], names)).toBe("Every day")
    })

    const sundayService = [
        { id: "a", name: "Worship", seconds: 1200 },
        { id: "b", name: "Sermon", seconds: 2400 }
    ]

    it("saves a program by name and loads it back for next week", () => {
        let program = saveProgramAs({ segments: sundayService, index: 1, auto: true }, "Sunday service", "s1")
        expect(program.saved).toEqual([{ id: "s1", name: "Sunday service", segments: sundayService }])
        expect(program.savedId).toBe("s1")

        // saving under the same name replaces it rather than adding a second copy
        program = saveProgramAs({ ...program, segments: [sundayService[1]] }, "sunday service ", "s2")
        expect(program.saved?.length).toBe(1)
        expect(program.saved?.[0].segments).toEqual([sundayService[1]])

        program = loadSavedProgram({ ...program, segments: [], index: 0 }, "s1")
        expect(program.segments).toEqual([sundayService[1]])
        expect(program.index).toBe(-1)

        expect(deleteSavedProgram(program, "s1").saved).toEqual([])
        expect(deleteSavedProgram(program, "s1").savedId).toBeUndefined()
    })

    it("does not save an empty program or a blank name", () => {
        const program = { segments: [], index: -1, auto: true }
        expect(saveProgramAs(program, "Sunday", "x")).toBe(program)
        expect(saveProgramAs({ ...program, segments: sundayService }, "  ", "x").saved).toBeUndefined()
    })
})
