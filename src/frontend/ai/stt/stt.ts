import { get, writable } from "svelte/store"
import { Main } from "../../../types/IPC/Main"
import { requestMain, sendMain } from "../../IPC/main"
import { ai, aiSttStatus, language } from "../../stores"
import { classifyListenError, isSilent, type ListenProblem, RECOVERY_DELAYS, streamLost } from "./listenStatus"

// The model follows many languages, but left to guess it writes English spoken with an
// Indian accent in Hindi script, and then no reference in it is found. So it is told:
// the app's language unless another is chosen, or "auto" to let it guess.
export const SPOKEN_LANGUAGES: Record<string, string> = { en: "English", es: "Spanish", fr: "French", pt: "Portuguese", de: "German", it: "Italian", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", pl: "Polish", ro: "Romanian", ru: "Russian", uk: "Ukrainian", ko: "Korean", ja: "Japanese", zh: "Chinese", hi: "Hindi", ar: "Arabic" }
export function spokenLanguage(chosen: string | undefined): string | undefined {
    if (chosen === "auto") return undefined
    if (chosen) return chosen
    const own = (get(language) || "en").slice(0, 2)
    const code = own === "ua" ? "uk" : own
    return SPOKEN_LANGUAGES[code] ? code : undefined
}

export const audioLevelStore = writable<number>(0.0)
// why listening is not working, for the panel to say in words (empty when it is fine)
export const listenProblem = writable<ListenProblem | "">("")
// the microphone is open but nothing audible has come in for a while
export const micSilent = writable(false)

export function resolveSttEngine(): string {
    return get(ai)?.stt?.engine || "nemotron"
}

type AudioLevelCallback = (level: number) => void

export class SpeechToText {
    private static ac: AudioContext | null = null
    private static stream: MediaStream | null = null
    private static sourceNode: MediaStreamAudioSourceNode | null = null
    private static captureNode: AudioWorkletNode | null = null
    private static listeners = new Set<AudioLevelCallback>()

    private static sessionToken = 0

    private static lastAudioAt = 0
    private static lastSoundAt = 0
    private static watchdog: ReturnType<typeof setInterval> | null = null
    private static recoveringToken = -1

    static async enable() {
        const operationId = ++this.sessionToken

        const captured = await this.restartCapture(operationId)
        if (operationId !== this.sessionToken) {
            this.stopCapture()
            return { ok: false, aborted: true }
        }
        if (!captured.ok) {
            listenProblem.set(classifyListenError(captured.error))
            return captured
        }

        const started = await this.restartEngine(operationId)
        if (operationId !== this.sessionToken) {
            this.stopCapture()
            return { ok: false, aborted: true }
        }

        if (!started.ok) {
            listenProblem.set(classifyListenError(started.error))
            this.stopCapture()
            return started
        }

        listenProblem.set("")
        return { ok: true }
    }

    static async restartEngine(operationId?: number) {
        const token = operationId ?? ++this.sessionToken
        const engine = resolveSttEngine()
        const engineOptions = { ...(get(ai)?.stt?.engineOptions?.[engine] || {}) }
        engineOptions.language = spokenLanguage(engineOptions.language)

        const result = await requestMain(Main.AI_LISTEN_START, { engine, engineOptions }, undefined, 60000)

        if (token !== this.sessionToken) return { ok: false, aborted: true }
        if (!result?.started) return { ok: false, error: result?.error }

        return { ok: true }
    }

    // useDefault: the chosen microphone is gone, so take whatever the computer's default input is
    static async restartCapture(operationId?: number, useDefault = false) {
        const token = operationId ?? ++this.sessionToken
        this.stopCapture()

        const savedDeviceId = get(ai).stt?.micDeviceId || ""
        const deviceId = useDefault ? "" : await this.resolveMicDeviceId(savedDeviceId)

        if (token !== this.sessionToken) return { ok: false, aborted: true }

        // Mute store update during initialization to avoid re-triggering component reactivity loop
        if (deviceId && deviceId !== savedDeviceId) {
            const currentAi = get(ai)
            if (currentAi?.stt) {
                currentAi.stt.micDeviceId = deviceId
            }
        }

        const stream = await this.getMicStream(deviceId)
        if (token !== this.sessionToken) {
            stream?.getTracks().forEach((track) => track.stop())
            return { ok: false, aborted: true }
        }

        if (!stream) return { ok: false, error: "No microphone access" }

        this.stream = stream
        const ac = await this.captureAudioContext(stream, token)

        if (token !== this.sessionToken) {
            this.stopCapture()
            return { ok: false, aborted: true }
        }

        if (!ac) return { ok: false, error: "Could not create audio context" }

        this.watchStream(stream, token)
        return { ok: true }
    }

    // a microphone that is unplugged or taken by another program stops sending audio without any error
    private static watchStream(stream: MediaStream, token: number) {
        this.lastAudioAt = this.lastSoundAt = Date.now()
        stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => void this.recoverMic(token)))
        navigator.mediaDevices?.addEventListener?.("devicechange", this.onDeviceChange)

        this.watchdog = setInterval(() => {
            const now = Date.now()
            if (streamLost(now, this.lastAudioAt)) void this.recoverMic(token)
            micSilent.set(isSilent(now, this.lastSoundAt))
        }, 1000)
    }

    private static onDeviceChange = () => {
        if (this.stream?.getAudioTracks().some((track) => track.readyState === "ended")) void this.recoverMic(this.sessionToken)
    }

    // the same microphone at 2 and 5 seconds, then the computer's default input at 15; after that the panel offers a button
    private static async recoverMic(token: number) {
        if (token !== this.sessionToken || this.recoveringToken === token) return
        this.recoveringToken = token
        listenProblem.set("disconnected")
        this.stopCapture()

        try {
            for (let attempt = 0; attempt < RECOVERY_DELAYS.length; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, RECOVERY_DELAYS[attempt]))
                if (token !== this.sessionToken) return

                const result = await this.restartCapture(token, attempt === RECOVERY_DELAYS.length - 1)
                if (token !== this.sessionToken) return
                if (result.ok) {
                    listenProblem.set("")
                    return
                }
            }
            aiSttStatus.set({ state: "error", message: "Microphone disconnected." })
        } finally {
            if (this.recoveringToken === token) this.recoveringToken = -1
        }
    }

    static disable() {
        this.sessionToken++
        sendMain(Main.AI_LISTEN_STOP)
        this.stopCapture()
    }

    static async resolveMicDeviceId(saved: string): Promise<string> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default")

            if (!inputs.length) return saved
            if (saved && inputs.some((d) => d.deviceId === saved)) return saved

            const virtualDefault = devices.find((d) => d.deviceId === "default")
            const systemDefault = virtualDefault?.groupId ? inputs.find((d) => d.groupId === virtualDefault.groupId) : undefined

            return systemDefault?.deviceId || inputs[0].deviceId
        } catch (err) {
            console.error("Could not enumerate microphones:", err)
            return saved
        }
    }

    static async getMicStream(deviceId = "", retries = 3, delayMs = 150): Promise<MediaStream | null> {
        const audioConstraints: MediaTrackConstraints = {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
            } catch (err: any) {
                if (err?.name === "NotReadableError" && attempt < retries - 1) {
                    console.warn(`[AI STT] Mic hardware busy, retrying (${attempt + 1}/${retries})...`)
                    await new Promise((resolve) => setTimeout(resolve, delayMs))
                    continue
                }

                if (err?.name === "NotReadableError") {
                    sendMain(Main.ACCESS_MICROPHONE_PERMISSION)
                    return null
                }

                if (err?.name === "OverconstrainedError" && deviceId) {
                    return this.getMicStream("", retries, delayMs)
                }

                console.error("Error accessing microphone:", err)
                return null
            }
        }

        return null
    }

    static async captureAudioContext(stream: MediaStream, operationId?: number): Promise<AudioContext | null> {
        try {
            const ac = new AudioContext({ sampleRate: 16000 })
            this.ac = ac

            const sourceNode = ac.createMediaStreamSource(stream)
            this.sourceNode = sourceNode

            await ac.audioWorklet.addModule("./assets/stt-processor.js")

            if ((operationId && operationId !== this.sessionToken) || this.ac !== ac || ac.state === "closed") {
                ac.close().catch(() => {})
                return null
            }
            console.info("STT processor module loaded")

            const captureNode = new AudioWorkletNode(ac, "stt-processor")
            this.captureNode = captureNode

            captureNode.port.onmessage = (e) => {
                const { buffer, level } = e.data || {}
                if (buffer) {
                    sendMain(Main.AI_AUDIO_DATA, { buffer })
                }
                this.lastAudioAt = Date.now()
                if (typeof level === "number") {
                    if (level >= 0.04) this.lastSoundAt = this.lastAudioAt
                    this.emitAudioLevel(level)
                }
            }

            sourceNode.connect(captureNode)
            captureNode.connect(ac.destination)

            return ac
        } catch (err) {
            console.error("Failed to capture audio context:", err)
            this.stopCapture()
            return null
        }
    }

    static onAudioLevel(callback: AudioLevelCallback): () => void {
        this.listeners.add(callback)
        return () => this.listeners.delete(callback)
    }

    private static emitAudioLevel(level: number) {
        const value = level < 0.04 ? 0 : level
        audioLevelStore.set(value)
        this.listeners.forEach((fn) => fn(value))
    }

    static stopCapture() {
        if (this.watchdog) clearInterval(this.watchdog)
        this.watchdog = null
        navigator.mediaDevices?.removeEventListener?.("devicechange", this.onDeviceChange)
        micSilent.set(false)

        ;[this.sourceNode, this.captureNode].forEach((node) => {
            try {
                node?.disconnect()
            } catch (_) {}
        })
        this.sourceNode = this.captureNode = null

        if (this.stream) {
            this.stream.getTracks().forEach((track) => {
                track.enabled = false
                track.stop()
            })
            this.stream = null
        }

        if (this.ac) {
            if (this.ac.state !== "closed") {
                this.ac.close().catch(() => {})
            }
            this.ac = null
        }

        this.emitAudioLevel(0.0)
    }
}
