// The church library's song shape, and how other formats become it.
//
// A song is sections in order, each a label ("Verse 1", "Chorus") and its
// lines, plus an arrangement: the order they are sung, repeats included. A
// section sung twice is stored once. Lines keep the writer's words and
// punctuation; only spacing and a leading lower-case letter are tidied.

export type SectionType = "verse" | "chorus" | "pre-chorus" | "bridge" | "tag" | "intro" | "outro" | "interlude" | "other"

export interface SongSection {
    label: string
    type: SectionType
    lines: string[]
}

export interface CleanSong {
    title: string
    authors?: string
    copyright?: string
    ccli?: string
    sections: SongSection[]
    arrangement: string[]
}

const LABELS: [RegExp, SectionType, string][] = [
    [/^(?:pre[\s-]?chorus|pre|pc)$/i, "pre-chorus", "Pre-chorus"],
    [/^(?:verse|v|vs)$/i, "verse", "Verse"],
    [/^(?:chorus|c|ch|refrain|r)$/i, "chorus", "Chorus"],
    [/^(?:bridge|b|br)$/i, "bridge", "Bridge"],
    [/^(?:tag|vamp|coda|ending|end)$/i, "tag", "Tag"],
    [/^(?:intro|introduction)$/i, "intro", "Intro"],
    [/^(?:outro)$/i, "outro", "Outro"],
    [/^(?:interlude|instrumental)$/i, "interlude", "Interlude"]
]

/** "Verse 2:", "chorus", "PRE-CHORUS", "V1" -> its type and number; null for a lyric line. */
export function readLabel(line: string): { type: SectionType; name: string; number?: number } | null {
    const match = line
        .trim()
        .replace(/[:.\-–]+$/, "")
        .match(/^([a-z][a-z\s-]*?)\s*(\d+)?$/i)
    if (!match || line.trim().length > 20) return null
    for (const [pattern, type, name] of LABELS) {
        if (pattern.test(match[1].trim())) return { type, name, number: match[2] ? Number(match[2]) : undefined }
    }
    return null
}

// Words that keep their capital when an all-capitals line becomes sentence case.
const PROPER = new Set("i god god's lord lord's jesus jesus' christ christ's spirit father father's son messiah emmanuel immanuel yahweh jehovah elohim adonai el shaddai rapha jireh nissi shalom elshaddai abba lamb king king's zion israel jerusalem calvary bethlehem nazareth galilee jordan judah egypt sinai canaan david abraham isaac jacob moses mary hallelujah alleluia hosanna holy ghost satan christmas easter africa nigeria".split(" "))

function sentenceCase(line: string): string {
    const lower = line.toLowerCase().replace(/[a-z']+/g, (word) => (PROPER.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    return lower.replace(/^([^A-Za-z]*)([a-z])/, (_m, lead, first) => lead + first.toUpperCase())
}

/** Spacing tidied, a line typed in capitals put in sentence case, the first letter capitalised. */
export function tidyLine(line: string): string {
    let text = line.replace(/\s+/g, " ").trim()
    const letters = text.replace(/[^A-Za-z]/g, "")
    if (letters.length >= 4 && letters === letters.toUpperCase()) text = sentenceCase(text)
    return text.charAt(0).toUpperCase() + text.slice(1)
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"])

/** Titles typed in all capitals or all lower case become title case; anything mixed is kept; very long ones are shortened. */
export function tidyTitle(title: string): string {
    let text = title.replace(/\s+/g, " ").trim()
    // some libraries keep a whole lyric in the title; keep its opening words
    if (text.length > 70)
        text = text
            .slice(0, 61)
            .replace(/\s+\S*$/, "")
            .replace(/[\s,;:.!-]+$/, "")
    if (!text) return text
    if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text
    return text
        .toLowerCase()
        .split(" ")
        .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(" ")
}

/** Slides of lines (a slide may open with a label line) -> sections and their sung order. */
export function toSections(slides: string[][]): { sections: SongSection[]; arrangement: string[] } {
    // each slide is a section; a slide may open with its label line
    const parts: { type: SectionType; name: string; number?: number; lines: string[]; labelled: boolean }[] = []
    for (const slide of slides) {
        let lines = slide.map(tidyLine).filter(Boolean)
        const label = lines.length ? readLabel(lines[0]) : null
        if (label) lines = lines.slice(1)
        if (lines.length) parts.push(label ? { ...label, lines, labelled: true } : { type: "verse", name: "Verse", lines, labelled: false })
    }

    // the same words sung again are one section, repeated in the arrangement
    const keyOf = (lines: string[]) => lines.join("\n").toLowerCase()
    const unique: typeof parts = []
    const order: number[] = []
    for (const part of parts) {
        let index = unique.findIndex((u) => keyOf(u.lines) === keyOf(part.lines))
        if (index < 0) index = unique.push(part) - 1
        else if (part.labelled && !unique[index].labelled) unique[index] = part
        order.push(index)
    }

    // with no chorus named, the unlabelled part sung most often (twice or more) is the chorus
    if (!unique.some((u) => u.type === "chorus")) {
        const repeats = unique.map((_, i) => order.filter((o) => o === i).length)
        const best = repeats.reduce((b, n, i) => (!unique[i].labelled && n > (repeats[b] ?? 0) ? i : b), -1)
        if (best >= 0 && repeats[best] >= 2) unique[best] = { ...unique[best], type: "chorus", name: "Chorus" }
    }

    const totals = unique.reduce<Partial<Record<SectionType, number>>>((t, u) => ({ ...t, [u.type]: (t[u.type] || 0) + 1 }), {})
    const counts: Partial<Record<SectionType, number>> = {}
    const sections: SongSection[] = unique.map((u) => {
        counts[u.type] = (counts[u.type] || 0) + 1
        const numbered = u.type === "verse" || (totals[u.type] || 0) > 1
        return { label: numbered ? `${u.name} ${u.number ?? counts[u.type]}` : u.name, type: u.type, lines: u.lines }
    })
    // a written number can collide with a counted one ("Verse 2" written twice): keep labels unique
    sections.forEach((s, i) => {
        let n = 2
        const base = s.label
        while (sections.slice(0, i).some((p) => p.label === s.label)) s.label = `${base} (${n++})`
    })

    return { sections, arrangement: order.map((i) => sections[i].label) }
}

// EASYWORSHIP (RTF) //

function decodeRtf(input: string): string {
    return input.replace(/\\u(-?\d+)\??/g, (_m, n) => String.fromCodePoint(Number(n) < 0 ? Number(n) + 65536 : Number(n))).replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => new TextDecoder("windows-1252").decode(Uint8Array.from([parseInt(hex, 16)])))
}

/** EasyWorship's RTF words -> slides of lines. An empty paragraph or a slide marker starts a new slide. */
export function easyWorshipSlides(rtf: string): string[][] {
    if (!rtf) return []
    let body = decodeRtf(rtf)
    const start = body.search(/\\pard/)
    if (start > 0) body = body.slice(start)

    body = body
        .replace(/[\r\n]+/g, "") // line breaks in the file itself mean nothing in RTF
        .replace(/\\sdslidemarker/gi, "\n\u0000\n") // explicit slide break
        .replace(/\\line(?![a-z])/gi, "\n")
        .replace(/\\par(?![a-z])/gi, "\n") // a paragraph is a line; an empty one is a slide break
        .replace(/\{\\\*[^{}]*\}/g, "") // ignorable destinations
        .replace(/\\[a-z]+-?\d*\s?/gi, "") // control words
        .replace(/[{}]/g, "")

    return body
        .split(/\n\s*\n|\u0000/)
        .map((block) =>
            block
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
        )
        .filter((lines) => lines.length)
}

export function cleanEasyWorshipSong(song: { title?: string; author?: string; copyright?: string; reference_number?: string }, rtf: string): CleanSong {
    const { sections, arrangement } = toSections(easyWorshipSlides(rtf))
    const text = (v?: string) => v?.replace(/\s+/g, " ").trim() || undefined
    return {
        title: tidyTitle(song.title || sections[0]?.lines[0] || "Untitled"),
        authors: text(song.author),
        copyright: text(song.copyright),
        ccli: text(song.reference_number)?.replace(/\D/g, "") || undefined,
        sections,
        arrangement
    }
}
