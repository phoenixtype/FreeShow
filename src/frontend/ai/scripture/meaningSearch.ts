// Scripture by meaning: when a preacher paraphrases a verse instead of quoting
// it ("God loved everyone so much he gave his only son"), local word matching
// misses it. Scriptural's search-scripture endpoint embeds the words and finds
// the passage by meaning over the whole Bible. It is public and unmetered.
//
// Only speech that sounds scriptural is sent, at most once every few seconds,
// and a meaning-only hit is always offered as a suggestion, never presented
// on its own (confidence 50 or below never auto-plays in AiManager).

import type { MatchResult } from "../../../types/ai/Ai"

const ENDPOINT = "https://sdtusilsfchpryrbmplq.supabase.co/functions/v1/search-scripture"
// Public anon key of the Scriptural project; it ships in every Scriptural client.
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkdHVzaWxzZmNocHJ5cmJtcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjU4NzcsImV4cCI6MjA3MTc0MTg3N30.tWnGvQlE2J-1bTmc_u3JDRyIQYJ7vR7jekk6oVtU4QM"

const MIN_INTERVAL_MS = 5000
const MIN_WORDS = 8
const QUERY_WORDS = 30
const TIMEOUT_MS = 4000

const BIBLICAL_VOCAB = new Set([
    "god",
    "lord",
    "jesus",
    "christ",
    "spirit",
    "holy",
    "father",
    "son",
    "faith",
    "sin",
    "grace",
    "mercy",
    "salvation",
    "righteous",
    "righteousness",
    "kingdom",
    "heaven",
    "hell",
    "eternal",
    "everlasting",
    "covenant",
    "gospel",
    "blessed",
    "commandment",
    "prophet",
    "prophets",
    "disciple",
    "apostle",
    "sabbath",
    "temple",
    "altar",
    "priest",
    "angel",
    "angels",
    "devil",
    "satan",
    "redeem",
    "redemption",
    "atonement",
    "forgive",
    "forgiveness",
    "repent",
    "soul",
    "flesh",
    "glory",
    "glorify",
    "worship",
    "praise",
    "pray",
    "prayer",
    "word",
    "truth",
    "light",
    "darkness",
    "love",
    "hope",
    "peace",
    "shepherd",
    "lamb",
    "cross",
    "resurrection",
    "crucified",
    "beginning",
    "creation",
    "created",
    "world",
    "flood",
    "commandments"
])
const ARCHAIC_MARKERS = new Set(["thou", "thee", "thy", "thine", "ye", "hath", "hast", "shalt", "shouldst", "wouldst", "doth", "didst", "unto", "verily", "behold", "saith", "cometh", "goeth", "whence", "wherefore", "whither", "thereof", "therein", "whosoever"])
const CONTEXT_PHRASES = ["the bible says", "scripture says", "it is written", "the word says", "jesus said", "the lord said", "god said", "as it says", "the apostle", "paul wrote", "paul says"]

/** Does this sound scriptural? Two biblical words, one archaic word, or a cue phrase. */
export function soundsScriptural(text: string): boolean {
    const lower = text.toLowerCase()
    if (CONTEXT_PHRASES.some((p) => lower.includes(p))) return true
    let count = 0
    for (const token of lower.match(/[a-z']+/g) || []) {
        if (ARCHAIC_MARKERS.has(token)) return true
        if (BIBLICAL_VOCAB.has(token) && ++count >= 2) return true
    }
    return false
}

interface Passage {
    reference: string
    match: "phrase" | "words" | "meaning"
    score: number
}

/** A phrase hit may auto-present; words and meaning hits are only offered. */
export function passageToMatch(passage: Passage): MatchResult {
    const confidence = passage.match === "phrase" ? 80 : passage.match === "words" ? 50 : Math.min(50, Math.round(passage.score * 70))
    return { type: "scripture", content: passage.reference.replace(/[–—]/g, "-"), confidence }
}

let lastRequest = 0
let controller: AbortController | null = null

export async function searchByMeaning(text: string, newWordsCount: number, isCancelled?: () => boolean): Promise<MatchResult | null> {
    if (newWordsCount < MIN_WORDS || !soundsScriptural(text)) return null
    if (Date.now() - lastRequest < MIN_INTERVAL_MS) return null
    if (!navigator.onLine) return null
    lastRequest = Date.now()

    controller?.abort()
    controller = new AbortController()
    const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS)

    try {
        const query = text.split(/\s+/).slice(-QUERY_WORDS).join(" ")
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ query, version: "KJV", limit: 1 }),
            signal: controller.signal
        })
        if (!response.ok || isCancelled?.()) return null
        const data = (await response.json()) as { results?: Passage[] }
        const top = data.results?.[0]
        return top ? passageToMatch(top) : null
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}
