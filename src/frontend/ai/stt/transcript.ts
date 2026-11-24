import { get } from "svelte/store"
import { ai, sttTranscript } from "../../stores"
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

        // words said to Matthias are a request, not the sermon: marked as read, and not searched
        const { finalized, unprocessed } = get(sttTranscript)
        if (Matthias.hear(`${finalized.slice(-MATTHIAS_CHARS)} ${unprocessed}`.trim(), Math.max(0, this.heardChars - MATTHIAS_CHARS), !part.interim)) {
            this.getTranscriptChunk()
            this.wordsSinceRequest = 0
            return
        }

        if (part.interim) {
            this.interimTimeout = setTimeout(() => {
                this.interimTimeout = null
                this.processPendingChunk()
            }, this.INTERIM_DEBOUNCE_MS)
        } else {
            this.interimTimeout = null
            this.processPendingChunk(textPart)
        }
    }

    static copy() {
        const text = get(sttTranscript).finalized
        if (!text) return

        navigator.clipboard.writeText(text)
        newToast("actions.copied")
    }

    // utterance: the finished phrase just heard, when this chunk ends one
    private static processPendingChunk(utterance?: string) {
        const chunk = this.getTranscriptChunk()
        if (chunk.newWordsCount === 0) return

        AiManager.processSTTChunk({ ...chunk, utterance })
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
