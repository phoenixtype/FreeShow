// Matthias: the name the room calls the copilot by, chosen to serve among the twelve
// (Acts 1). Picked by measuring what the app's own speech model writes when it is said:
// with Nigerian voices 16 of 18 times to the letter and all 18 with the spellings below
// (Silas 12, Baruch and Berea almost never), and it works for the person leading the app.
// The commands are spelled for the same voices: "next vas", "takova", "Ps twenty three".
//
// This file only understands words. It decides nothing about the screen.

import { distance } from "../scripture/nearestBook"
import { normalizeNumberWords, parseCopilotCommand, type CopilotCommand } from "../scripture/voiceCommands"

export const NAME = "Matthias"

const SPELLINGS = "matthias|mathias|matias|mattias|matheus|mathius|matthius|matthayas|mathayas|matthaias|mathaias|matthyas|mathyas|mathies|matthies|mateus|matheas|mattheas|mathais|matthais"
// what it can also sound like; taken only with "hey" or straight before a plain command
const LOOSE = "masais|mathis|matis|messias|mathes|mathers"
const HEY = "hey|hi|ok|okay|hello"

const CALL = new RegExp(`(?:^|[^\\p{L}])(?:(${HEY})[\\s,]+)?(?:he|hey|hi)?(?:(${SPELLINGS})|(${LOOSE}))(?=$|[^\\p{L}])[\\s,.!?:;-]*`, "giu")
// "the lot fell upon Matthias": spoken about, not to
const SPOKEN_ABOUT = /(?:^|\s)(?:and|with|of|paul|to|named|was|is|that|for|from|by|brother|apostle|like|when|but|then|chose|or|about|on|upon|appointed|called)\s*$/iu

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
    | { type: "slide"; direction: "next" | "previous"; count?: number }
    | { type: "goto-slide"; slide: number | "last" }
    | { type: "section"; name: string; number?: number }
    | { type: "draw"; shape: "cross" | "circle" | "arrow" | "box" | "line" }
    | { type: "drawing"; command: "clean" | "clear" }
    | { type: "again" }
    | { type: "before"; kind?: "scripture" | "song" }
    | { type: "clear-layer"; layer: "background" | "overlays" }
    | { type: "plan"; step: "start" | "next" | "previous" }
    | { type: "open-plan"; name: string }
    | { type: "add-to-plan"; what: string }
    | { type: "remove-from-plan"; what: string }
    | { type: "overlay"; name: string; on: boolean }
    | { type: "media"; name: string; kind?: "image" | "video" }
    | { type: "audio"; command: "stop" | "mute" | "unmute" }
    | { type: "countdown"; seconds: number; add?: boolean }
    | { type: "timer"; command: "start" | "next" | "play_pause" }
    | { type: "page"; page: PageName }
    | { type: "tell"; about: "screen" | "next" | "help" }
    | { type: "result"; direction: "next" | "previous" }
    | { type: "version"; name: string }
    | { type: "song"; name: string }
    | { type: "search"; query: string; topic?: boolean }
    | { type: "show"; what: string }
    | { type: "unknown"; words: string }

export const PAGES = ["show", "edit", "stage", "draw", "settings", "songs", "scripture", "media", "audio", "overlays", "templates", "calendar"] as const
export type PageName = (typeof PAGES)[number]

const SHOW = "show(?: me| us)?|put up|foot up|put on|put|bring up|pull up|pool up|open(?: up)?|go to|turn to|take (?:me|us) to|give (?:me|us)|display|read|let us see|let's see|let us read|let's read|project"
const FIND = "find(?: me| us)?|fine|search(?: for| the bible for| scripture for)?|look up|look for|where does (?:it|the bible|scripture) say|where is it written|which verse|what verse|what does the bible say about|what does scripture say about|what scripture"

const OPEN_SENTENCE = /\b(?:without|not|don't|dont|never|instead|except|only|but|because|then)\b|^(?:me|us) (?:the )?(?:words|lyrics|text|chords)\b/
const MOST_NAME_WORDS = 7
const NUMBER = "\\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thir|four|fif|six|seven|eigh|nine|twen|for|hundred"
// what the speech model writes for these words said with a West African accent; safe here
// because only words said straight to Matthias are read this way
const HEARD: [RegExp, string][] = [
    [/\bnext ?(?:vas|vass|vers|versus|verses|was|us|va|v|verse)\b/g, "next verse"],
    [/\bprevious ?(?:vas|vass|vers|versus|was|us)\b/g, "previous verse"],
    [/\b(?:vas|vass|vers|versus)\b/g, "verse"],
    [/\bvast?r(?:e|i|ee)\b/g, "verse three"],
    [/\bdiverse (?=about|that|on)/g, "the verse "],
    [/^tak(?:e)? ?ov(?:a|er|ah)$/g, "take over"],
    [/^stan(?:d)? ?down$/g, "stand down"],
    [/^(?:issued?|showed|shown|shone|shohn|shon|shows|sho)\b/g, "show"],
    [/^(?:puts?|foot) ?(?:up|ups|off)\b/g, "put up"],
    [/^(?:turned|return|time|turns) to\b/g, "turn to"],
    [/^(?:sin|sings|syn|seen|sim|seem|thing) (?=\w)/g, "sing "],
    [/^(?:cla|clar|clea|claire|clare|clay|hear|clean|glare)\b(?= (?:the|that|it|all|every|screen))/g, "clear"],
    [new RegExp(`\\b(?:ps|psum|psam|sum|some|som|somb|son|song|zone|salm|sam|samu|palm|psa) (?=${NUMBER})`, "g"), "psalm "],
    [/\b(?:fast|face|force|fest) (?=samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)/g, "first "]
]

const strip = (text: string) =>
    HEARD.reduce(
        (words, [heard, meant]) => words.replace(heard, meant),
        text
            .toLowerCase()
            .replace(/[.!?,;:]+(?=\s|$)/g, "")
            .replace(/\s+/g, " ")
            .replace(/^(?:e |en |and |a |is |du |u |would |should )+(?=next|show|sho|put|find|clear|turn|sing)/, "")
            .trim()
    )
        .replace(POLITE, "")
        .replace(/(?:\s+(?:please|thank you|thanks|sir|ma|for us|for me|on the screen|on screen|right now|now|quickly))+$/g, "")
        .trim()
const POLITE = /^(?:(?:please|kindly|now|uh|um|so|okay|ok|just|quickly|go ahead and|(?:can|could|would|will) you(?: please| kindly)?|(?:can|could|may) (?:we|i) (?:have|get|see)|i(?:'d| would) like(?: you)? to(?: see| have)?|i (?:want|need)(?: you)? to(?: see| have)?|we (?:want|need)(?: you)? to(?: see| have)?|we need|help (?:me|us)(?: to)?)\s+)+/g

// one after another: "put up Psalm 23 then clear the screen"
const THEN = /\s*(?:[,;]\s*)?\b(?:and then|and after that|after that|then)\b\s*/i
const AND = /\s*,?\s+and\s+/i
// what may follow a bare "and": never an open request, "and" is an ordinary word in those
const FOLLOWS = ["draw", "drawing", "clear", "clear-layer", "restore", "slide", "goto-slide", "section", "navigate", "version", "lock", "screen", "again", "plan", "timer", "agent", "audio", "countdown", "overlay", "remove-from-plan"]

/** the requests in what was said, in order; one that is not understood keeps it all together */
export function parseRequests(spoken: string): Request[] {
    const whole = () => [parseRequest(spoken)]
    const parts = spoken.split(THEN).filter((part) => part.trim())
    if (parts.length > 1) {
        const requests = parts.flatMap((part) => parseRequests(part))
        return requests.some((request) => request.type === "unknown") ? whole() : requests
    }

    const and = spoken.split(AND)
    if (and.length < 2) return whole()
    for (let i = and.length - 1; i > 0; i--) {
        const first = parseRequest(and.slice(0, i).join(" and "))
        const last = parseRequest(and.slice(i).join(" and "))
        if (["unknown", "search"].includes(first.type) || !FOLLOWS.includes(last.type)) continue
        return [...parseRequests(and.slice(0, i).join(" and ")), last]
    }
    return whole()
}

/** what was asked, in the order that plain commands win over open ones */
export function parseRequest(spoken: string): Request {
    const request = parseWords(strip(spoken))
    if (request.type !== "unknown" || !request.words) return request
    // run together or misspelled ("cletherscreen"): the one plain command it is nearest to
    const meant = nearestCommand(request.words)
    return meant ? parseWords(meant) : request
}

const COMMANDS = ["clear the screen", "clear everything", "next verse", "previous verse", "next chapter", "previous chapter", "next slide", "previous slide", "another one", "bring it back", "take it down", "lock the screen", "unlock the screen", "turn the screen on", "turn the screen off", "start the service", "next item", "previous item", "take over", "stand down", "stop listening"]
function nearestCommand(words: string): string | null {
    const said = words.replace(/ /g, "")
    if (said.length < 7) return null
    if (/^[ck]l[a-z]{0,8}scr[a-z]*$/.test(said)) return "clear the screen"
    const scored = COMMANDS.map((command) => ({ command, score: distance(said, command.replace(/ /g, "")) / said.length })).sort((a, b) => a.score - b.score)
    return scored[0].score <= 0.25 && scored[1].score - scored[0].score > 0.05 ? scored[0].command : null
}

function parseWords(t: string): Request {
    if (!t) return { type: "unknown", words: "" }

    if (/^(?:unlock)(?: the)?(?: screen)?$/.test(t)) return { type: "lock", on: false }
    if (/^(?:lock|hold|freeze)(?: the| that| it)?(?: screen| there)?$/.test(t)) return { type: "lock", on: true }
    if (/^(?:turn|switch) (?:the )?screens? on$|^(?:turn|switch) on (?:the )?screens?$/.test(t)) return { type: "screen", on: true }
    if (/^(?:turn|switch) (?:the )?screens? off$|^(?:turn|switch) off (?:the )?screens?$/.test(t)) return { type: "screen", on: false }
    if (/^(?:clear|hear|clean|clay) (?:all|everything)$|^(?:go )?(?:to )?(?:black|blank)(?: the screen| screen| out)?$|^(?:black|blank) (?:it|everything) out$|^remove everything$/.test(t)) return { type: "clear", all: true }
    if (/^(?:(?:clear|hear|clean|wipe)(?: (?:the|that|it|this))?(?: screen| words| text| lyrics| verse| scripture| song| off)?|take (?:it|that|this|the (?:verse|scripture|song|words|lyrics|text|slide)) (?:down|off)|take (?:down|off) (?:the )?(?:verse|scripture|song|words|lyrics|text|slide)|remove (?:it|that|this)|hide (?:it|that|this))$/.test(t)) return { type: "clear", all: false }
    const sketch = t.match(/^(?:d?raw|daw|drew)(?: me| us)?(?: a| an| the| one)?(?: (?:picture|drawing|image|sketch) of)?(?: a| an| the)? (cross|circle|arrow|box|square|rectangle|line)(?: (?:on|in|onto|over) (?:the )?(?:paint ?board|paint|screen|drawing ?board|board|picture))?$/)
    if (sketch) return { type: "draw", shape: ({ square: "box", rectangle: "box" } as Record<string, "box">)[sketch[1]] || (sketch[1] as "cross") }
    if (/^(?:clean up|clean|tidy up|tidy|neaten|straighten)(?: up)?(?: the| my| this| that)? (?:drawing|paint|sketch|illustration)(?: up)?$/.test(t)) return { type: "drawing", command: "clean" }
    if (/^(?:clear|erase|remove|delete|wipe|take down)(?: off)?(?: the| my| this| that)? (?:drawing|paint ?board|paint|sketch|illustration)$/.test(t)) return { type: "drawing", command: "clear" }
    const layer = t.match(/^(?:clear|remove|hide|take (?:off|down)) (?:the )?(background|overlays?)$/)
    if (layer) return { type: "clear-layer", layer: layer[1] === "background" ? "background" : "overlays" }
    if (/^(?:show|put up|read|repeat|give us|put) (?:it|that|this)(?: one)?(?: up)? again$|^(?:repeat|again|once more|one more time)(?: (?:it|that|this))?$/.test(t)) return { type: "again" }
    if (/^(?:(?:go )?back to|show|bring back|put up) (?:the )?(?:(?:previous|last) (?:scripture|passage|song)|one before|what was up before|what we had before)(?: again)?$|^(?:previous|last) (?:scripture|passage)$/.test(t)) return { type: "before", ...(/scripture|passage/.test(t) ? { kind: "scripture" } : /song/.test(t) ? { kind: "song" } : {}) }
    if (/^(?:bring|put) (?:it|that|this) back(?: up)?$|^undo$|^restore(?: it| the screen)?$/.test(t)) return { type: "restore" }
    const overlay = t.match(/^(show|put up|put on|bring up|turn on|hide|remove|take down|take off|clear|turn off) (?:the |our )?(?:(logo|watermark)|(.+?) overlay)$/)
    if (overlay) return { type: "overlay", name: overlay[2] || overlay[3], on: /^(?:show|put|bring|turn on)/.test(overlay[1]) }
    const media = t.match(/^(?:show|play|put up|put on|bring up|start|run|project|display) (?:the |our )?(.+?) (video|clip|movie|picture|image|photo|background)$|^(?:change|set|switch) (?:the )?background to (?:the )?(.+)$/)
    if (media && !/verse|chapter|\d/.test(t)) return { type: "media", name: media[1] || media[3], ...(/video|clip|movie/.test(media[2] || "") ? { kind: "video" } : /picture|image|photo/.test(media[2] || "") ? { kind: "image" } : {}) }
    if (/^(?:stop|turn off|fade(?: out)?|kill|cut|end) (?:the )?(?:music|audio|sound|track|pads?)$/.test(t)) return { type: "audio", command: "stop" }
    if (/^(?:mute|silence)(?: (?:the )?(?:music|audio|sound|track|speakers?|everything))$/.test(t)) return { type: "audio", command: "mute" }
    if (/^unmute(?: (?:the )?(?:music|audio|sound|track|speakers?|everything))?$/.test(t)) return { type: "audio", command: "unmute" }
    const clock = normalizeNumberWords(t)
    const count = clock.match(/^(?:start|set|begin|put|run|give(?: (?:him|her|them|the (?:speaker|preacher|pastor)|pastor))?|set up) (?:a |an |the |up )*(?:(?:timer|countdown|clock)(?: (?:for|of|to))? )?(\d{1,3}|a|one|half an)[ -](minutes?|seconds?|hours?)(?: (?:timer|countdown|clock|for the (?:speaker|preacher|sermon)|to speak))?$/)
    const more = clock.match(/^(?:add|give (?:him|her|them|the (?:speaker|preacher|pastor)|pastor)) (\d{1,2}|an?) (?:more |extra )?(minutes?|seconds?)(?: more| to the (?:timer|clock|countdown))?$/)
    const span = (amount: string, unit: string) => (amount === "half an" ? 0.5 : Number(amount) || 1) * (unit.startsWith("hour") ? 3600 : unit.startsWith("min") ? 60 : 1)
    if (more && /\b(?:add|more|extra)\b/.test(t)) return { type: "countdown", seconds: span(more[1], more[2]), add: true }
    if (count) return { type: "countdown", seconds: span(count[1], count[2]) }

    if (/^(?:stop listening|be quiet|go to sleep|mute)$/.test(t)) return { type: "listen", on: false }
    if (/^(?:pause|stand down|hands off|stop|let me drive|manual mode|agent mode off|turn off agent mode)$/.test(t)) return { type: "agent", on: false }
    if (/^(?:resume|carry on|take over|you drive|lead|agent mode|agent mode on|turn on agent mode|continue by yourself)$/.test(t)) return { type: "agent", on: true }

    if (/^(?:next|another|the other|a different) (?:result|one|match|passage)$|^not that one$|^(?:wrong one|something else)$/.test(t)) return { type: "result", direction: "next" }
    if (/^(?:previous|last|first) (?:result|match)$/.test(t)) return { type: "result", direction: "previous" }
    const n = normalizeNumberWords(t)
    if (/^(?:read on|keep (?:reading|going)|continue(?: reading| the reading)?|go on|move on)$/.test(t)) return { type: "navigate", command: { type: "verse-step", delta: 1 } }
    if (/^(?:from the top|start (?:again|over|from the top)|back to the top|go back to the (?:start|beginning)|from the beginning|top of the song|start of the song)$/.test(t)) return { type: "navigate", command: { type: "first-chapter" } }
    const steps = n.match(/^(?:go |move |skip )?(?:(next|forward|ahead|on|back|previous|last) )?(\d{1,2}) (slides?|verses?|lines?)(?: (forward|ahead|on|back|backwards?))?$/)
    if (steps && (steps[1] || steps[4])) return { type: "slide", direction: /back|previous|last/.test(steps[1] || steps[4]) ? "previous" : "next", count: Math.max(1, Math.min(20, Number(steps[2]))) }
    const slide = n.match(/^(?:go |move |jump |back )*(?:to )?(?:the )?(?:(first|last) slide|slide (?:number )?(\d{1,3}))$/)
    if (slide) return { type: "goto-slide", slide: slide[1] === "last" ? "last" : slide[1] ? 1 : Number(slide[2]) }
    const section = n.match(/^(?:(?:go|jump|move|take us|back|sing|repeat|show|play)(?: back)?(?: us)? )?(?:to )?(?:the )?(pre ?-?chorus|chorus|bridge|refrain|intro|outro|ending|tag|hook)(?: (\d))?(?: again| one more time| once more)?$/)
    if (section) return { type: "section", name: section[1].replace(/[ -]/g, ""), ...(section[2] ? { number: Number(section[2]) } : {}) }
    const songVerse = n.match(/^(?:(?:sing|repeat) )(?:the )?verse (\d)(?: again)?$/) || n.match(/^(?:sing |go to )?(?:the )?(first|second|third|fourth|fifth) verse of (?:the|this) song$/)
    if (songVerse) return { type: "section", name: "verse", number: Number(songVerse[1]) || ["first", "second", "third", "fourth", "fifth"].indexOf(songVerse[1]) + 1 }

    if (/^(?:start|begin) (?:the )?(?:service|plan|program|programme)$|^(?:go to |show )?(?:the )?first (?:item|thing)(?: in the (?:plan|service))?$/.test(t)) return { type: "plan", step: "start" }
    if (/^(?:go to |show |move to )?(?:the )?next (?:item|thing|song|one in the (?:plan|service)|in the (?:plan|service))(?: (?:in|on) the (?:plan|service|list))?$/.test(t)) return { type: "plan", step: "next" }
    if (/^(?:go (?:back )?to |show )?(?:the )?previous (?:item|thing|song)(?: (?:in|on) the (?:plan|service|list))?$/.test(t)) return { type: "plan", step: "previous" }
    const plan = t.match(/^open (?:the )?(?:plan|project|service)(?: called| named| for)? (.+)$|^open (?:the )?(.+) (?:plan|project)$/)
    if (plan) return { type: "open-plan", name: plan[1] || plan[2] }
    const add = t.match(/^(?:add|put) (?:the song )?(.+?) (?:to|in|into|on) (?:the |this |our |today's )?(?:plan|project|service|set ?list)$/)
    if (add) return { type: "add-to-plan", what: add[1] }
    const take = t.match(/^(?:remove|take|delete|drop|take out) (?:the song |the )?(.+?) (?:out of|off|from) (?:the |this |our |today's )?(?:plan|project|service|set ?list)$/)
    if (take) return { type: "remove-from-plan", what: take[1] }
    // anything else about a plan is for the model, not for the screen
    if (/\b(?:plan|project|set ?list)\b/.test(t) && !/^(?:find|search|what does|project)/.test(t)) return { type: "unknown", words: t }
    if (/^start (?:the )?(?:speaker(?:'s)? )?(?:timer|countdown|clock)$/.test(t)) return { type: "timer", command: "start" }
    if (/^(?:next|go to the next) (?:segment|speaker)$/.test(t)) return { type: "timer", command: "next" }
    if (/^(?:pause|stop|resume|continue) (?:the )?(?:speaker(?:'s)? )?(?:timer|countdown|clock)$/.test(t)) return { type: "timer", command: "play_pause" }

    if (/^(?:what|which) (?:verse|scripture|passage|song) is (?:this|that|it|on|up|showing)(?: on)?$/.test(t)) return { type: "tell", about: "screen" }
    if (/^what(?:'s| is)(?: showing| up)?(?: on)?(?: the)?(?: screen| up| showing)$|^what is (?:up|showing)$/.test(t) || /^what(?:'s| is)(?: on)?$/.test(t)) return { type: "tell", about: "screen" }
    if (/^what(?:'s| is|s) (?:next|coming(?: up)?(?: next)?)$/.test(t)) return { type: "tell", about: "next" }
    if (/^(?:help|what can you do|what can i (?:say|ask))$/.test(t)) return { type: "tell", about: "help" }
    const page = t.match(new RegExp(`^(?:open|go to|switch to|take me to)(?: up)?(?: the| my)? (${PAGES.join("|")}|song library|library|bible)(?: page| tab| view| screen)?$`))
    if (page) return { type: "page", page: ({ "song library": "songs", library: "songs", bible: "scripture" } as Record<string, PageName>)[page[1]] || (page[1] as PageName) }

    if (/^next (?:slide|line|part)$|^(?:go )?forward$/.test(t)) return { type: "slide", direction: "next" }
    if (/^(?:previous|last) (?:slide|line|part)$/.test(t)) return { type: "slide", direction: "previous" }

    const navigate = parseCopilotCommand(t.replace(/^(?:go|move) (?:to )?(?:the )?(next|previous)/, "$1"))
    // "go to chapter 3 of Romans" names a book: that is a passage, not a step
    if (navigate && !/\bof [a-z]/.test(t)) return { type: "navigate", command: navigate }

    const version = t.match(/^(?:use|switch(?: it)? to|change(?: it| the version| the bible| the translation)? to|in|read (?:it |that |this )?in|show (?:it |that |this )?in|give (?:it )?(?:to )?(?:me|us) (?:it |that )?in|try)(?: the)? (.+?)(?: (?:version|translation|bible))?$/)
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
    // a long sentence, or one that says what NOT to do, is a request for the model, not a name to look up
    if (show && !OPEN_SENTENCE.test(show[1]) && show[1].split(" ").length <= MOST_NAME_WORDS) return { type: "show", what: show[1] }
    if (show) return { type: "unknown", words: t }
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

// asks or makes rather than shows: a passage or song named in it is not to be put up
const NOT_SHOWING = /^(?:who|what|why|how|when|where|which|is|are|was|does|do|did|make|create|add|build|write|plan|explain|tell|list|remove|delete|rename|change|set|prepare|compare|summari[sz]e)\b/i
const MOST_WORDS = 9
/** short enough, and said so that a passage or title in it can be what is wanted on screen */
export const namesWhatToShow = (words: string) => !NOT_SHOWING.test(words.trim()) && !/\b(?:plan|project|set ?list)\b/i.test(words) && words.trim().split(/\s+/).length <= MOST_WORDS
