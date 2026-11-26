import { get } from "svelte/store"
import { ai, sttTranscript, transcriptLog, type TranscriptLine } from "../../stores"
import { newToast } from "../../utils/common"
import { Matthias } from "../voice/matthiasAgent"
import { AiManager } from "../manager/AiManager"

type TranscriptPart = {
    text: string
    interim?: boolean

    startMs?: number
    endMs?: number

    language?: string
    music?: boolean
    utteranceEnd?: boolean
    confidence?: number
    glue?: boolean
}

const MATTHIAS_CHARS = 600

interface PushedWord {
    words: number
    confidence?: number
}

export class Transcript {
    private static readonly MAX_TRANSCRIPT_CHARS = 10000
    private static readonly INTERIM_DEBOUNCE_MS = 350

    // everything finalized since the app started, and how much of the end Matthias reads
    private static heardChars = 0

    static push(part: TranscriptPart) {
        if (!get(ai).enabled) return

        const textPart = part.text.trim()
        // what the model labels as music is shown, and never read as speech
        if (part.music) {
            const label = part.interim ? "" : textPart
            if (label) this.log(label, !!part.glue)
            if (part.utteranceEnd) this.utterance = ""
            return
        }

        sttTranscript.update((t) => {
            if (part.interim) return { ...t, unprocessed: textPart }

            const wordCount = part.glue ? 0 : textPart.split(/\s+/).filter(Boolean).length
            this.pushed = [...this.pushed, { words: wordCount, confidence: part.confidence }].slice(-40)

            const separator = t.finalized && !part.glue ? " " : ""
            this.heardChars += separator.length + textPart.length
            const finalized = (t.finalized + separator + textPart).slice(-this.MAX_TRANSCRIPT_CHARS)

            return { finalized, unprocessed: "" }
        })

        if (this.interimTimeout) clearTimeout(this.interimTimeout)
        this.interimTimeout = null

        if (!part.interim && textPart) {
            this.log(textPart, !!part.glue)
            this.utterance = (this.utterance + (this.utterance && !part.glue ? " " : "") + textPart).slice(-this.MAX_UTTERANCE_CHARS)
        }
        // everything said since the last pause, once the speaker has paused
        let utterance = ""
        if (!part.interim && part.utteranceEnd) {
            utterance = this.utterance
            this.utterance = ""
        }

        // words said to Matthias are a request, not the sermon: marked as read, and not searched
        const { finalized, unprocessed } = get(sttTranscript)
        if (Matthias.hear(`${finalized.slice(-MATTHIAS_CHARS)} ${unprocessed}`.trim(), Math.max(0, this.heardChars - Math.min(MATTHIAS_CHARS, finalized.length)), !part.interim)) {
            this.getTranscriptChunk()
            this.wordsSinceRequest = 0
            this.utterance = ""
            return
        }

        if (part.interim) {
            this.interimTimeout = setTimeout(() => {
                this.interimTimeout = null
                this.processPendingChunk()
            }, this.INTERIM_DEBOUNCE_MS)
        } else {
            this.interimTimeout = null
            if (utterance) this.processUtterance(utterance)
            else this.processPendingChunk()
        }
    }

    private static readonly MAX_UTTERANCE_CHARS = 600
    private static utterance = ""

    // a whole utterance can be a command ("back"); its words are then not searched as well
    private static processUtterance(utterance: string) {
        const chunk = this.getTranscriptChunk()
        AiManager.processUtterance(utterance)
            .then((moved) => (moved || !chunk.newWordsCount ? undefined : AiManager.processSTTChunk(chunk)))
            .catch((err) => console.warn("Live Copilot could not follow what was said", err))
    }

    // a line runs until the speaker pauses, or it is long enough to read
    private static readonly LINE_GAP_MS = 4000
    private static readonly LINE_CHARS = 220
    private static readonly MAX_LINES = 3000
    private static lastPart = 0
    private static log(text: string, glue: boolean) {
        const now = Date.now()
        const joins = now - this.lastPart < this.LINE_GAP_MS
        this.lastPart = now
        transcriptLog.update((lines) => {
            const last = lines[lines.length - 1]
            if (last && (glue || (joins && last.text.length < this.LINE_CHARS))) return [...lines.slice(0, -1), { ...last, text: last.text + (glue ? "" : " ") + text }]
            return [...lines, { at: now, text }].slice(-this.MAX_LINES)
        })
    }

    /** empties the log and what is searched; the answer puts the log back */
    static clear(): () => void {
        const lines: TranscriptLine[] = get(transcriptLog)
        transcriptLog.set([])
        sttTranscript.set({ finalized: "", unprocessed: "" })
        if (this.interimTimeout) clearTimeout(this.interimTimeout)
        this.interimTimeout = null
        this.resetState()
        this.lastPart = 0
        this.utterance = ""
        return () => transcriptLog.update((since) => [...lines, ...since].slice(-this.MAX_LINES))
    }

    static copy() {
        const text = get(transcriptLog)
            .map((line) => `${new Date(line.at).toLocaleTimeString()}  ${line.text}`)
            .join("\n")
        if (!text) return

        navigator.clipboard.writeText(text)
        newToast("actions.copied")
    }

    private static processPendingChunk() {
        const chunk = this.getTranscriptChunk()
        if (chunk.newWordsCount === 0) return

        AiManager.processSTTChunk(chunk)?.catch((err) => console.warn("Live Copilot could not follow what was said", err))
    }

    private static readonly OVERLAP_WORDS = 8
    private static readonly MAX_CHUNK_WORDS = 120

    private static interimTimeout: ReturnType<typeof setTimeout> | null = null
    private static wordsSinceRequest = Infinity
    private static lastSentWords: string[] = []
    private static pushed: PushedWord[] = []

    private static confidenceOfLast(wordCount: number): number | undefined {
        let sum = 0
        let words = 0
        let covered = 0

        for (let i = this.pushed.length - 1; i >= 0 && covered < wordCount; i--) {
            const push = this.pushed[i]
            if (push.confidence !== undefined && push.words) {
                sum += push.confidence * push.words
                words += push.words
            }
            covered += push.words
        }

        return words ? Math.round(sum / words) : undefined
    }

    private static getTranscriptChunk() {
        const { finalized = "", unprocessed = "" } = get(sttTranscript)
        const combined = `${finalized} ${unprocessed}`.trim()
        if (!combined) return this.resetState()

        let words = combined.split(/\s+/).filter(Boolean)
        if (!words.length) return this.resetState()

        if (words.length > this.MAX_CHUNK_WORDS) words = words.slice(-this.MAX_CHUNK_WORDS)

        const startIdx = this.calculateStartIndex(words)
        const newWordsCount = words.length - startIdx
        // nothing said before or to Matthias is searched again: it would bring back what was up then
        const overlap = Math.min(this.OVERLAP_WORDS, this.wordsSinceRequest)
        this.wordsSinceRequest += newWordsCount
        const chunkStartIdx = Math.max(0, startIdx - overlap)

        this.lastSentWords = words

        return {
            chunkWithOverlap: words.slice(chunkStartIdx).join(" "),
            newWordsCount,
            confidence: this.confidenceOfLast(newWordsCount)
        }
    }

    private static resetState() {
        this.lastSentWords = []
        this.pushed = []
        return { chunkWithOverlap: "", newWordsCount: 0 }
    }

    private static calculateStartIndex(words: string[]): number {
        if (!this.lastSentWords.length) return 0

        const last = this.lastSentWords.map((w) => w.toLowerCase())
        const curr = words.map((w) => w.toLowerCase())

        // 1. Direct prefix match
        let prefixCount = 0
        while (prefixCount < last.length && prefixCount < curr.length && last[prefixCount] === curr[prefixCount]) {
            prefixCount++
        }
        if (prefixCount > 0 && prefixCount >= last.length - 3) return prefixCount

        // 2. The window slid: once past MAX_CHUNK_WORDS the oldest words drop off the
        // front, so what was sent before now starts a few words in
        for (let shift = 1; shift <= last.length - 3; shift++) {
            const overlap = last.length - shift
            if (overlap > curr.length) continue
            let same = true
            for (let i = 0; i < overlap && same; i++) same = last[shift + i] === curr[i]
            if (same) return overlap
        }

        // 3. Seam match
        const maxSeam = Math.min(last.length, curr.length, 30)
        for (let seam = maxSeam; seam >= 3; seam--) {
            const tail = last.slice(-seam)
            const head = curr.slice(0, seam)
            if (tail.every((w, idx) => w === head[idx])) return seam
        }

        return 0
    }
}
