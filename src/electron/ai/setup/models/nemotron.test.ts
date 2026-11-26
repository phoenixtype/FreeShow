import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../../IPC/main", () => ({ sendToMain: vi.fn() }))
vi.mock("../DownloadManager", () => ({ DownloadManager: class {}, missingSpace: () => 0, partPathFor: (url: string, dest: string) => dest + ".part" }))
import { NEMOTRON_MODEL_FILES, NemotronSetupManager } from "./nemotron"

const hashes: Record<string, string> = Object.fromEntries(Object.values(NEMOTRON_MODEL_FILES).map((entry) => [entry.file, entry.sha256]))
hashes["silero_vad.onnx"] = "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"

function fakeDownloads(fails: (url: string) => boolean) {
    const asked: string[] = []
    const dlm = {
        key: "k",
        name: "n",
        downloadFile: vi.fn(async (url: string) => {
            asked.push(url)
            if (fails(url)) throw new Error("unreachable")
        }),
        computeSha256: vi.fn(async (file: string) => hashes[file.split("/").pop()!]),
        safeUnlink: vi.fn(),
        isAbortError: () => false,
        errorMessage: (e: any) => e.message,
        reportError: vi.fn((message: string) => ({ ok: false, error: message })),
        reportComplete: vi.fn(() => ({ ok: true }))
    }
    vi.spyOn(NemotronSetupManager, "getDownloadManager").mockReturnValue(dlm as any)
    vi.spyOn(NemotronSetupManager, "verifyEngine").mockResolvedValue(false)
    vi.spyOn(NemotronSetupManager, "checkIntegrity").mockResolvedValue("ok")
    vi.mock("fs", async (original) => {
        const real = ((await original()) as any).default
        return { default: { ...real, existsSync: () => false, statSync: () => ({ size: 10 }), promises: { ...real.promises, statfs: async () => ({ bavail: 1e9, bsize: 4096 }) } } }
    })
    return { asked, dlm }
}

describe("getting the speech model", () => {
    beforeEach(() => vi.restoreAllMocks())

    it("takes it from our own copy first", async () => {
        const { asked } = fakeDownloads(() => false)
        expect(await NemotronSetupManager.downloadEngine("/m")).toEqual({ ok: true })
        expect(asked).toHaveLength(5)
        expect(asked.every((url) => url.startsWith("https://github.com/phoenixtype/FreeShow/releases/download/speech-model-1/"))).toBe(true)
    })
    it("falls back to the original source when our copy cannot be reached", async () => {
        const { asked, dlm } = fakeDownloads((url) => url.includes("phoenixtype"))
        expect(await NemotronSetupManager.downloadEngine("/m")).toEqual({ ok: true })
        expect(asked.filter((url) => url.includes("huggingface.co"))).toHaveLength(4)
        expect(dlm.reportError).not.toHaveBeenCalled()
    })
    it("says so when neither can be reached", async () => {
        fakeDownloads(() => true)
        expect((await NemotronSetupManager.downloadEngine("/m")).ok).toBe(false)
    })
})
