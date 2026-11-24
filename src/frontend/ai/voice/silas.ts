// Silas: the name the room calls the copilot by. He carried the apostles' letter to
// Antioch, where it was read to the church (Acts 15). Chosen by measuring: over eight
// accents and four commands the app's own speech model wrote "Silas" 28 times in 32,
// against 1 in 8 for Baruch and none for Berea; the spellings below are the rest.
//
// This file only understands words. It decides nothing about the screen.

import { parseCopilotCommand, type CopilotCommand } from "../scripture/voiceCommands"

export const NAME = "Silas"

const SPELLINGS = "silas|silos|silus|sillas|sylas|cilas|cylas|sylus|cilus|silis|saylas|sailas|sighlas"
// what it can also sound like; taken only with "hey" or straight before a plain command
const LOOSE = "silence|silo|silent|silage"
const HEY = "hey|hi|ok|okay|hello"

const CALL = new RegExp(`(?:^|[^\\p{L}])(?:(${HEY})[\\s,]+)?(?:(${SPELLINGS})|(${LOOSE}))(?=$|[^\\p{L}])[\\s,.!?:;-]*`, "giu")
// "Paul and Silas prayed": spoken about, not to
const SPOKEN_ABOUT = /(?:^|\s)(?:and|with|of|paul|to|named|called|was|is|that|for|from|by|brother|apostle|like|when|but|then|chose|or|about)\s*$/iu

export interface Call {
    /** where in the words the call begins */
    at: number
    /** another call follows, so this request is finished */
    closed: boolean
    request: string
    hey: boolean
    /** heard by a sound-alike, so only a plain command counts */
    loose: boolean
}

/** every call in the words, oldest first */
export function findCalls(words: string): Call[] {
    const found: { start: number; end: number; hey: boolean; loose: boolean }[] = []
    for (const match of words.matchAll(CALL)) {
        const start = match.index ?? 0
        const hey = !!match[1]
        const loose = !!match[3]
        if (!hey && SPOKEN_ABOUT.test(words.slice(0, start + 1))) continue
        found.push({ start, end: start + match[0].length, hey, loose })
    }
    return found.map((call, i) => ({ at: call.start, closed: !!found[i + 1], request: words.slice(call.end, found[i + 1]?.start ?? words.length).trim(), hey: call.hey, loose: call.loose })).filter((call) => !call.loose || call.hey || ["unknown", "search"].indexOf(parseRequest(call.request).type) < 0)
}

export type Request =
    | { type: "navigate"; command: CopilotCommand }
    | { type: "clear"; all: boolean }
    | { type: "restore" }
    | { type: "screen"; on: boolean }
    | { type: "lock"; on: boolean }
    | { type: "agent"; on: boolean }
    | { type: "listen"; on: false }
    | { type: "slide"; direction: "next" | "previous" }
    | { type: "result"; direction: "next" | "previous" }
    | { type: "version"; name: string }
    | { type: "song"; name: string }
    | { type: "search"; query: string; topic?: boolean }
    | { type: "show"; what: string }
    | { type: "unknown"; words: string }

const SHOW = "show(?: me| us)?|put up|foot up|put on|put|bring up|pull up|pool up|open(?: up)?|go to|turn to|take (?:me|us) to|give (?:me|us)|display|read|let us see|let's see|let us read|let's read|project"
const FIND = "find(?: me| us)?|fine|search(?: for| the bible for| scripture for)?|look up|look for|where does (?:it|the bible|scripture) say|where is it written|which verse|what verse|what does the bible say about|what does scripture say about|what scripture"

const strip = (text: string) =>
    text
        .toLowerCase()
        .replace(/[.!?,;:]+(?=\s|$)/g, "")
        .replace(/\s+/g, " ")
        .replace(/^(?:please|can you|could you|would you|will you|kindly|now|uh|um|so)\s+/g, "")
        .replace(/\s+(?:please|thank you|thanks|for us|on the screen|on screen)$/g, "")
        .trim()

/** what was asked, in the order that plain commands win over open ones */
export function parseRequest(spoken: string): Request {
    const t = strip(spoken)
    if (!t) return { type: "unknown", words: "" }

    if (/^(?:unlock)(?: the)?(?: screen)?$/.test(t)) return { type: "lock", on: false }
    if (/^(?:lock|hold|freeze)(?: the| that| it)?(?: screen| there)?$/.test(t)) return { type: "lock", on: true }
    if (/^(?:turn|switch) (?:the )?screens? on$|^(?:turn|switch) on (?:the )?screens?$/.test(t)) return { type: "screen", on: true }
    if (/^(?:turn|switch) (?:the )?screens? off$|^(?:turn|switch) off (?:the )?screens?$/.test(t)) return { type: "screen", on: false }
    if (/^(?:clear|hear|clean|clay) (?:all|everything)$|^(?:go )?(?:black|blank)(?: the screen| screen)?$/.test(t)) return { type: "clear", all: true }
    if (/^(?:(?:clear|hear|clean|wipe)(?: (?:the|that|it|this))?(?: screen| words| verse| scripture| off)?|take (?:it|that|this) (?:down|off)|remove (?:it|that|this)|hide (?:it|that|this))$/.test(t)) return { type: "clear", all: false }
    if (/^(?:bring|put) (?:it|that|this) back(?: up)?$|^undo$|^restore(?: it| the screen)?$/.test(t)) return { type: "restore" }
    if (/^(?:stop listening|be quiet|go to sleep|mute)$/.test(t)) return { type: "listen", on: false }
    if (/^(?:pause|stand down|hands off|stop|let me drive|manual mode|agent mode off|turn off agent mode)$/.test(t)) return { type: "agent", on: false }
    if (/^(?:resume|carry on|take over|you drive|lead|agent mode|agent mode on|turn on agent mode|continue by yourself)$/.test(t)) return { type: "agent", on: true }

    if (/^(?:next|another|the other|a different) (?:result|one|match|passage)$|^not that one$|^(?:wrong one|something else)$/.test(t)) return { type: "result", direction: "next" }
    if (/^(?:previous|last|first) (?:result|match)$/.test(t)) return { type: "result", direction: "previous" }
    if (/^next (?:slide|line|part)$|^(?:go )?forward$/.test(t)) return { type: "slide", direction: "next" }
    if (/^(?:previous|last) (?:slide|line|part)$/.test(t)) return { type: "slide", direction: "previous" }

    const navigate = parseCopilotCommand(t.replace(/\bnext was\b/, "next verse").replace(/^(?:go|move) (?:to )?(?:the )?(next|previous)/, "$1"))
    // "go to chapter 3 of Romans" names a book: that is a passage, not a step
    if (navigate && !/\bof [a-z]/.test(t)) return { type: "navigate", command: navigate }

    const version = t.match(/^(?:use|switch to|change to|in|read (?:it |that |this )?in|show (?:it |that |this )?in|give (?:it )?(?:to )?(?:me|us) (?:it |that )?in|try)(?: the)? (.+?)(?: (?:version|translation|bible))?$/)
    if (version && /\b(?:use|switch|change|in|try)\b/.test(t) && !/\d|chapter|verse/.test(version[1])) return { type: "version", name: version[1] }

    const song = t.match(/^(?:sing|play|start|let us sing|let's sing|(?:(?:show|put up|bring up|open|project) )?(?:the )?(?:song|hymn|chorus))(?: the| called| song| hymn)* (.+)$/)
    if (song) return { type: "song", name: song[1] }

    // a topic ("about being anxious") is searched as a question; words ("that says love is patient") as they are
    const search = (preposition: string, query: string): Request => (/^(?:about|on|for|that talks about)$/.test(preposition) ? { type: "search", query, topic: true } : { type: "search", query })
    const about = t.match(new RegExp(`^(?:(?:${SHOW}|${FIND}) )?(?:a |the |that |some |me )*(?:verse|verses|scripture|scriptures|passage|passages|story|place)(?: in the bible)? (about|on|where|that says|that talks about|which says|with|of|saying|for) (.+)$`))
    if (about) return search(about[1], about[2])
    const says = t.match(/^what (?:does (?:the bible|scripture) say|is written) about (.+)$/)
    if (says) return search("about", says[1])
    const find = t.match(new RegExp(`^(?:${FIND}) (.+)$`))
    if (find) {
        const rest = find[1].replace(/^(?:a |the )?(?:verse|scripture|passage)s? /, "").match(/^(?:(about|where|that says) )?(.+)$/)
        return search(rest?.[1] || "", rest?.[2] || find[1])
    }

    const show = t.match(new RegExp(`^(?:${SHOW})(?: the)? (.+)$`))
    if (show) return { type: "show", what: show[1] }
    return { type: "unknown", words: t }
}

const plainWords = (text: string) =>
    text
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
const SMALL = new Set(["the", "a", "an", "of", "and", "to", "is", "song", "hymn"])

/** the one library song a spoken title means, or null when it could be several */
export function matchTitle<T extends { name: string }>(spoken: string, list: T[]): T | null {
    const wanted = plainWords(spoken)
    const key = wanted.filter((w) => !SMALL.has(w))
    if (!wanted.length) return null
    const scored = list
        .map((item) => {
            const words = plainWords(item.name)
            if (words.join(" ") === wanted.join(" ")) return { item, score: 2 }
            const main = words.filter((w) => !SMALL.has(w))
            if (!key.length || !main.length) return { item, score: 0 }
            const shared = key.filter((w) => main.includes(w)).length
            // all of the spoken words, in a title not much longer, or nearly all of both
            return { item, score: (2 * shared) / (key.length + main.length) }
        })
        .filter((entry) => entry.score >= 0.66)
        .sort((a, b) => b.score - a.score)
    if (!scored.length) return null
    // two copies of one song are no puzzle; two different songs are
    if (scored[1] && scored[1].score === scored[0].score && plainWords(scored[1].item.name).join(" ") !== plainWords(scored[0].item.name).join(" ")) return null
    return scored[0].item
}
