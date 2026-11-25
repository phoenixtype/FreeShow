// What a church's folder of files turns into: which files are songs, which are
// media, and how a plain-text song becomes the library's section shape. Pure,
// so the setup command (scripts/church-library/church.mts) and its tests share it.

import { tidyTitle, toSections, type CleanSong } from "./songFormat"

export type MediaKind = "image" | "video" | "audio" | "pdf" | "deck"

const MEDIA: Record<string, { kind: MediaKind; mime: string }> = {
    jpg: { kind: "image", mime: "image/jpeg" },
    jpeg: { kind: "image", mime: "image/jpeg" },
    png: { kind: "image", mime: "image/png" },
    webp: { kind: "image", mime: "image/webp" },
    gif: { kind: "image", mime: "image/gif" },
    mp4: { kind: "video", mime: "video/mp4" },
    mov: { kind: "video", mime: "video/quicktime" },
    webm: { kind: "video", mime: "video/webm" },
    m4v: { kind: "video", mime: "video/x-m4v" },
    mp3: { kind: "audio", mime: "audio/mpeg" },
    wav: { kind: "audio", mime: "audio/wav" },
    m4a: { kind: "audio", mime: "audio/mp4" },
    pdf: { kind: "pdf", mime: "application/pdf" },
    ppt: { kind: "deck", mime: "application/vnd.ms-powerpoint" },
    pptx: { kind: "deck", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    key: { kind: "deck", mime: "application/x-iwork-keynote-sffkey" }
}

const extOf = (name: string) => name.toLowerCase().split(".").pop() || ""

export type FileRole = { role: "song"; ext: string } | { role: "media"; kind: MediaKind; mime: string } | { role: "ignore" }

/** What a file in the church's folder is. Songs.db and SongWords.db are read together as an EasyWorship library, so they are ignored here. */
export function classifyFile(name: string): FileRole {
    if (name.startsWith(".")) return { role: "ignore" }
    const ext = extOf(name)
    if (ext === "txt") return { role: "song", ext }
    const media = MEDIA[ext]
    return media ? { role: "media", ...media } : { role: "ignore" }
}

/** A song typed as plain text: the file name is the title; blank lines separate sections; a line like "Chorus" or "Verse 2:" names one. */
export function textSong(fileName: string, text: string): CleanSong | null {
    const slides = text
        .replace(/\r\n?/g, "\n")
        .split(/\n\s*\n/)
        .map((block) =>
            block
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
        )
        .filter((lines) => lines.length)
    const { sections, arrangement } = toSections(slides)
    if (!sections.length) return null
    return { title: tidyTitle(fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ")), sections, arrangement }
}

/** A file name safe as the last part of a storage path. */
export function storageName(name: string): string {
    const clean = name
        .normalize("NFKD")
        .replace(/[^\w.\- ]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
    return clean || "file"
}
