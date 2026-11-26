// What is kept about a service. All of it stays on this computer.

export type DetectionTier = "reference" | "quote" | "event" | "meaning" | "model" | "song" | "command" | "version"

export interface Detection {
    heard: string // the words it was found in
    tier: DetectionTier // how it was found
    confidence: number // 1-100
    found: string // the passage or song
    action: "offered" | "shown" | "undone"
}

export type RecordsRequest =
    | { action: "save"; name: string; content: string } // ask where, then write
    | { action: "detection"; detection: Detection } // a line of the detection log
    | { action: "open-detections" }
    | { action: "prune" } // delete old detection logs

export type SaveResult = "saved" | "cancelled" | "failed"
