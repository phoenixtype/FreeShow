import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { getAudioMetadata } from "./audio"

const folder = mkdtempSync(path.join(tmpdir(), "audio-"))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

const text = (value: string) => Buffer.from(value, "latin1")
const int32 = (value: number) => {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(value)
    return buffer
}
const chunk = (id: string, body: Buffer) => Buffer.concat([text(id), int32(body.length), body])

// a second of silence, with a title and artist written in it
function wav(file: string) {
    const format = Buffer.alloc(16)
    format.writeUInt16LE(1, 0) // PCM
    format.writeUInt16LE(1, 2) // mono
    format.writeUInt32LE(8000, 4)
    format.writeUInt32LE(16000, 8)
    format.writeUInt16LE(2, 12)
    format.writeUInt16LE(16, 14)
    const info = Buffer.concat([text("INFO"), chunk("INAM", text("Amazing Grace\0")), chunk("IART", text("John Newton\0"))])
    const body = Buffer.concat([text("WAVE"), chunk("fmt ", format), chunk("LIST", info), chunk("data", Buffer.alloc(16000))])
    const target = path.join(folder, file)
    writeFileSync(target, chunk("RIFF", body))
    return target
}

describe("audio details", () => {
    it("reads a file's title and artist", async () => {
        const details = await getAudioMetadata(wav("song.wav"))
        expect(details?.common.title).toBe("Amazing Grace")
        expect(details?.common.artist).toBe("John Newton")
    })

    it("answers nothing for a file that is not audio", async () => {
        const target = path.join(folder, "notes.mp3")
        writeFileSync(target, "not audio at all")
        const details = await getAudioMetadata(target)
        expect(details?.common?.title).toBeUndefined()
    })
})
