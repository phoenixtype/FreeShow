/**
 * Temple stores a song as one ChordPro chart: "[G]Amazing [C]grace" with chords
 * inline. Sections are marked by {c: Chorus} or {comment: Verse 1}, by
 * {start_of_chorus} blocks, by a "[Chorus]" line or by a bare "Verse 1" line.
 * A chart with no markers at all is split at blank lines into Verse 1, 2, 3.
 *
 * Chords stay inline: Planning Center's line parser (getShow) reads them.
 */

export type TempleSection = { label: string; lyrics: string }

const SECTION_WORDS = "pre-chorus|prechorus|post-chorus|postchorus|verse|chorus|bridge|tag|intro|outro|interlude|instrumental|ending|refrain|vamp|coda|turnaround|breakdown|hook"
const SECTION_LABEL = new RegExp(`^(${SECTION_WORDS})(\\s*\\d+)?(\\s*\\(?x\\s*\\d+\\)?)?$`, "i")

const BLOCK_STARTS: { [directive: string]: string } = {
    start_of_verse: "Verse",
    sov: "Verse",
    start_of_chorus: "Chorus",
    soc: "Chorus",
    start_of_bridge: "Bridge",
    sob: "Bridge"
}
const COMMENT_DIRECTIVES = new Set(["c", "comment", "ci", "comment_italic", "cb", "comment_box"])

function asLabel(text: string): string | null {
    const cleaned = text.trim().replace(/:$/, "").trim()
    return SECTION_LABEL.test(cleaned) ? titleCase(cleaned) : null
}

function titleCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

export function templeChartSections(chart: string | null | undefined): TempleSection[] {
    const sections: TempleSection[] = []
    let label: string | null = null
    let lines: string[] = []
    let autoVerse = 0

    const flush = () => {
        const lyrics = lines.join("\n").trim()
        if (lyrics) sections.push({ label: label || `Verse ${++autoVerse}`, lyrics })
        lines = []
    }

    for (const raw of (chart || "").split(/\r?\n/)) {
        const line = raw.trim()

        const directive = line.match(/^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}$/)
        if (directive) {
            const name = directive[1].toLowerCase()
            const value = directive[2] || ""
            if (BLOCK_STARTS[name]) {
                flush()
                label = value.trim() || BLOCK_STARTS[name]
            } else if (name.startsWith("end_of_") || name === "eov" || name === "eoc" || name === "eob") {
                flush()
                label = null
            } else if (COMMENT_DIRECTIVES.has(name) && asLabel(value)) {
                flush()
                label = asLabel(value)
            }
            // {title}, {key}, {tempo} and comments like "x2" are the song's fields or band notes
            continue
        }

        const bracketed = line.match(/^\[([^\]]+)\]$/)
        const header = bracketed ? asLabel(bracketed[1]) : asLabel(line)
        if (header) {
            flush()
            label = header
            continue
        }

        if (!line) {
            // a blank line ends a stanza; under a label the next stanza keeps it
            flush()
            continue
        }

        lines.push(raw.trimEnd())
    }
    flush()

    return sections
}
