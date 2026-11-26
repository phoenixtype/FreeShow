// Recognises a song from the library while it is being sung.
//
// Every song is broken into word triples ("way maker miracle", "maker miracle
// worker"). A triple found in many songs ("i will praise") says little about
// which one is being sung, so it weighs less, and one found in more than
// COMMON songs is ignored. Evidence builds up over a few lines and fades with a
// half-life, so a song is recognised after a line or two and forgotten soon
// after it stops. Transcripts of singing are rough, which is why a run of
// three words, not a whole line, is the unit.

export interface SongText {
    id: string
    name: string
    text: string
}

export interface SongHit {
    id: string
    name: string
    confidence: number
    /** heard in more than one chunk, over several seconds: singing, not a phrase quoted in passing */
    sustained: boolean
}

const N = 3
const COMMON = 12
const HALF_LIFE_MS = 20_000
const RECOUNT_AFTER_MS = 15_000 // a chorus sung again counts again
const MIN_SCORE = 2.5
const MIN_SONG_WORDS = 12
const SUSTAINED_MS = 8_000
const RUN_GAP_MS = 15_000 // quiet this long and the next line starts a new run
const LATEST_WORDS = 6

export function words(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[‘’']/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
}

// FNV-1a: a number per triple keeps an index of thousands of songs small
function hash(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

export function triples(list: string[]): number[] {
    const out: number[] = []
    for (let i = 0; i + N <= list.length; i++) out.push(hash(list.slice(i, i + N).join(" ")))
    return out
}

export class SongIndex {
    private songs: SongText[] = []
    private sets: Set<number>[] = []
    // triple -> index of the one song that has it, or the list of songs
    private byTriple = new Map<number, number | number[]>()

    constructor(songs: SongText[]) {
        for (const song of songs) {
            const list = words(song.text)
            if (list.length < MIN_SONG_WORDS) continue
            const index = this.songs.push(song) - 1
            const set = new Set(triples(list))
            this.sets.push(set)
            for (const t of set) {
                const had = this.byTriple.get(t)
                if (had === undefined) this.byTriple.set(t, index)
                else if (typeof had === "number") this.byTriple.set(t, [had, index])
                else had.push(index)
            }
        }
    }

    get size() {
        return this.songs.length
    }

    song(index: number) {
        return this.songs[index]
    }

    // two copies of one song (libraries have plenty): most of their lines are the same
    sameSong(a: number, b: number): boolean {
        const [small, large] = this.sets[a].size < this.sets[b].size ? [this.sets[a], this.sets[b]] : [this.sets[b], this.sets[a]]
        let shared = 0
        for (const t of small) if (large.has(t)) shared++
        return shared >= small.size * 0.7
    }

    // the songs a triple belongs to, with the weight it carries
    lookup(t: number): { songs: number[]; weight: number } | null {
        const had = this.byTriple.get(t)
        if (had === undefined) return null
        const songs = typeof had === "number" ? [had] : had
        if (songs.length > COMMON) return null
        return { songs, weight: 1 / songs.length }
    }
}

export class SongDetector {
    private scores = new Map<number, { score: number; at: number }>()
    private counted = new Map<number, number>()
    private runs = new Map<number, { since: number; last: number; chunks: number }>()

    constructor(private index: SongIndex) {}

    // text: the latest transcript, overlap included; repeated triples are not counted twice
    push(text: string, now = Date.now()): SongHit | null {
        for (const [t, at] of this.counted) if (now - at > RECOUNT_AFTER_MS) this.counted.delete(t)

        const gained = new Set<number>()
        for (const t of triples(words(text))) {
            if (this.counted.has(t)) continue
            const found = this.index.lookup(t)
            if (!found) continue
            this.counted.set(t, now)
            for (const song of found.songs) {
                const was = this.scores.get(song)
                this.scores.set(song, { score: (was ? decay(was, now) : 0) + found.weight, at: now })
                gained.add(song)
            }
        }

        for (const song of gained) {
            const run = this.runs.get(song)
            this.runs.set(song, run && now - run.last <= RUN_GAP_MS ? { since: run.since, last: now, chunks: run.chunks + 1 } : { since: now, last: now, chunks: 1 })
        }

        // only songs heard in these words compete: what was sung earlier is not news,
        // and a song that just ended must not hide the one that started
        const ranked: { song: number; score: number }[] = []
        for (const [song, entry] of this.scores) {
            const score = decay(entry, now)
            if (score < 0.1) this.scores.delete(song)
            else if (gained.has(song)) ranked.push({ song, score })
        }
        ranked.sort((a, b) => b.score - a.score || a.song - b.song)
        const best = ranked[0]?.song ?? -1
        const first = ranked[0]?.score || 0
        if (best < 0 || first < MIN_SCORE) return null

        let confidence = Math.min(98, Math.round(35 + 12 * first))
        // a different song with the same lines: offer, never present on its own
        const rival = ranked.slice(1).find((r) => !this.index.sameSong(best, r.song))
        if (rival && rival.score >= first * 0.8) confidence = Math.min(confidence, 60)

        const song = this.index.song(best)
        const run = this.runs.get(best)!
        return { id: song.id, name: song.name, confidence, sustained: run.chunks >= 2 && now - run.since >= SUSTAINED_MS }
    }

    reset() {
        this.scores.clear()
        this.counted.clear()
        this.runs.clear()
    }
}

function decay(entry: { score: number; at: number }, now: number) {
    return entry.score * Math.pow(0.5, (now - entry.at) / HALF_LIFE_MS)
}

// The slide being sung: the one sharing the most triples with the latest words,
// the very last of which count twice.
// A chorus shows up on several slides, so among equals the first at or after
// `from` (the slide on screen) wins: the song moves on rather than back.
export function bestSlide(slides: string[], recent: string, from = 0): number | null {
    const sung = new Set(triples(words(recent)))
    if (!sung.size) return null
    const latest = new Set(triples(words(recent).slice(-LATEST_WORDS)))
    const hits = slides.map((text) => triples(words(text)).reduce((count, t) => count + (sung.has(t) ? 1 : 0) + (latest.has(t) ? 1 : 0), 0))
    const most = Math.max(0, ...hits)
    if (!most) return null
    const ahead = hits.findIndex((h, i) => h === most && i >= from)
    return ahead >= 0 ? ahead : hits.indexOf(most)
}
