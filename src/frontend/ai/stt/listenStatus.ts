// What went wrong with listening, in words a volunteer can act on. No Svelte, no IPC: easy to test.

export type ListenProblem = "model" | "permission" | "disconnected" | "other"

export function classifyListenError(error: string | undefined): ListenProblem {
    const text = (error || "").toLowerCase()
    if (/local model|could not be initialized|not supported/.test(text)) return "model"
    if (/no microphone access|notallowed|permission denied|not allowed/.test(text)) return "permission"
    return "other"
}

const NOTICES: Record<ListenProblem, { message: string; action: string }> = {
    model: { message: "The speech model is not on this computer yet.", action: "Get the speech model" },
    permission: { message: "This app is not allowed to use the microphone.", action: "Allow the microphone" },
    disconnected: { message: "Microphone disconnected.", action: "Try again" },
    other: { message: "Listening stopped.", action: "Try again" }
}
export const listenNotice = (problem: ListenProblem) => NOTICES[problem]

// a lost microphone: try again after 2, 5 and 15 seconds, then leave it to the operator
export const RECOVERY_DELAYS = [2000, 5000, 15000]
// the capture sends a block every 100 ms, so three seconds without one means the stream is gone
export const NO_AUDIO_MS = 3000
// microphone alive but nothing audible
export const SILENCE_NOTICE_MS = 20000

export function streamLost(now: number, lastAudioAt: number) {
    return lastAudioAt > 0 && now - lastAudioAt >= NO_AUDIO_MS
}
export function isSilent(now: number, lastSoundAt: number) {
    return lastSoundAt > 0 && now - lastSoundAt >= SILENCE_NOTICE_MS
}

// "asked" is true once the operator has asked to listen and has not stopped it since
export function shouldRetryListening(input: { state: string; asked: boolean; problem: ListenProblem | "" }) {
    if (input.state !== "error" || !input.asked) return false
    return input.problem !== "model" && input.problem !== "permission"
}
