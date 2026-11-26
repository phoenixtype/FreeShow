import os from "os"
import path from "path"
import type { SttEngineOptions } from "../../../../types/ai/AiSettings"
import { ToMain } from "../../../../types/IPC/ToMain"
import { sendToMain } from "../../../IPC/main"
import { LocalModelManager } from "../../setup/LocalModelManager"
import { canRestartAfterCrash, type TranscriberSegment } from "../sttHelper"
import type { NemotronWorkerRequest, NemotronWorkerResponse } from "./nemotronWorker"

// the model is 680 MB: an older computer with a spinning disk takes a while to read it
const WORKER_START_TIMEOUT = 55000
const WORKER_FLUSH_TIMEOUT = 3000
const WORKER_STALL_TIMEOUT = 60000
const WORKER_STALL_CHECK_INTERVAL = 5000

export class NemotronTranscriber {
    private options: SttEngineOptions
    private onSegment: (segment: TranscriberSegment) => void
    private onError: (message: string) => void
    private onInterim?: (text: string) => void

    private child: Electron.UtilityProcess | null = null
    private stopped = false

    private readyResolve: ((ok: boolean) => void) | null = null
    private stoppedResolve: (() => void) | null = null
    private startErrorMessage = ""

    private lastWorkerMessageAt = 0
    private stallTimer: NodeJS.Timeout | null = null
    private restarting = false
    private crashRestarts: number[] = []
    private modelDir = ""

    constructor(options: SttEngineOptions, onSegment: (segment: TranscriberSegment) => void, onError: (message: string) => void, onInterim?: (text: string) => void) {
        this.options = options
        this.onSegment = onSegment
        this.onError = onError
        this.onInterim = onInterim
    }

    // decoding only ever runs in its own process: on the app's main thread it would freeze every window
    async start() {
        this.modelDir = LocalModelManager.getModelDir("nemotron")
        if (await this.startWorker()) return true
        throw new Error(this.startErrorMessage || "Speech recognition did not start. Close other programs and try again.")
    }

    async stop() {
        this.stopped = true
        this.clearStallTimer()

        const { child } = this
        this.child = null

        if (child) {
            try {
                this.post(child, { type: "stop" })
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, WORKER_FLUSH_TIMEOUT)
                    this.stoppedResolve = () => {
                        clearTimeout(timer)
                        resolve()
                    }
                })
            } catch {}
            try {
                child.kill()
            } catch {}
        }

        return true
    }

    pushAudio(buffer: Uint8Array) {
        if (!this.child) return false
        this.post(this.child, { type: "audio", data: buffer, at: Date.now() })
        return true
    }

    private async startWorker(): Promise<boolean> {
        let child: Electron.UtilityProcess
        try {
            const { utilityProcess } = require("electron") as typeof import("electron")
            if (!utilityProcess?.fork) return false
            child = utilityProcess.fork(path.join(__dirname, "./nemotronWorker.js"), [], { serviceName: "Scriptural transcription" })
        } catch (err) {
            console.error("[nemotron] Could not spawn the decode process:", err)
            return false
        }

        this.child = child
        // the screens come first: decoding takes the processor time they leave
        child.once("spawn", () => {
            try {
                if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
            } catch (err) {
                console.warn("[nemotron] Could not lower the decode priority:", err)
            }
        })
        this.lastWorkerMessageAt = Date.now()
        this.armStallWatchdog()

        child.on("message", (msg: NemotronWorkerResponse) => this.handleWorkerMessage(msg))
        child.on("exit", (code) => {
            if (this.child !== child) return
            this.child = null
            // a crash while starting up is reported by the start itself
            const starting = Boolean(this.readyResolve)
            this.readyResolve?.(false)
            this.stoppedResolve?.()
            if (!this.stopped && !starting) void this.restartAfterCrash(code)
        })

        this.post(child, { type: "start", language: this.options.language || "en", decodeLanguage: this.options.language, modelDir: this.modelDir })

        const ok = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                this.readyResolve = null
                resolve(false)
            }, WORKER_START_TIMEOUT)
            this.readyResolve = (value: boolean) => {
                clearTimeout(timer)
                this.readyResolve = null
                resolve(value)
            }
        })

        if (!ok) {
            this.child = null
            try {
                child.kill()
            } catch {}
        }
        return ok
    }

    private handleWorkerMessage(message: NemotronWorkerResponse) {
        if (!message || typeof message !== "object") return
        this.lastWorkerMessageAt = Date.now()

        const handlers: Record<string, () => void> = {
            segment: () => message.type === "segment" && this.onSegment(message.segment),
            interim: () => message.type === "interim" && this.onInterim?.(message.text),
            ready: () => this.readyResolve?.(true),
            stopped: () => this.stoppedResolve?.(),
            error: () => {
                if (message.type !== "error") return
                if (this.readyResolve) {
                    this.startErrorMessage = message.message
                    this.readyResolve(false)
                } else if (!this.stopped) {
                    this.onError(message.message)
                }
            }
        }

        handlers[message.type]?.()
    }

    private post(child: Electron.UtilityProcess, message: NemotronWorkerRequest) {
        try {
            child.postMessage(message)
        } catch (err) {
            console.error("[nemotron] Failed to reach the decode process:", err)
        }
    }

    private async restartAfterCrash(code: number) {
        const message = `Nemotron transcription process exited unexpectedly (code ${code})`
        const now = Date.now()
        if (!canRestartAfterCrash(this.crashRestarts, now)) {
            this.onError(message)
            return
        }

        this.crashRestarts.push(now)
        this.restarting = true
        this.onInterim?.("")
        sendToMain(ToMain.TOAST, "Speech recognition stopped and is starting again.")
        try {
            const ok = await this.startWorker()
            if (this.stopped) await this.stop()
            else if (!ok) this.onError(this.startErrorMessage || message)
        } finally {
            this.restarting = false
        }
    }

    private clearStallTimer() {
        if (this.stallTimer) {
            clearInterval(this.stallTimer)
            this.stallTimer = null
        }
    }

    private armStallWatchdog() {
        this.clearStallTimer()
        this.stallTimer = setInterval(() => void this.checkStall(), WORKER_STALL_CHECK_INTERVAL)
        this.stallTimer.unref?.()
    }

    private async checkStall() {
        if (this.stopped || this.restarting || !this.child) return
        if (Date.now() - this.lastWorkerMessageAt < WORKER_STALL_TIMEOUT) return

        this.restarting = true

        // likely just not speaking
        console.info(`[nemotron] Decode process went silent for ${Math.round((Date.now() - this.lastWorkerMessageAt) / 1000)}s - restarting process`)

        const { child } = this
        this.child = null
        try {
            child?.kill()
        } catch {}
        this.onInterim?.("")

        try {
            const ok = await this.startWorker()
            if (!ok && !this.stopped) this.onError(this.startErrorMessage || "Nemotron transcription process could not be restarted")
        } finally {
            this.restarting = false
        }
    }
}
