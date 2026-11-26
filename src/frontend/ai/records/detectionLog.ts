// The record of what was detected, so a wrong showing can be looked at afterwards.
// Nothing is written unless the operator switched it on.

import { get } from "svelte/store"
import type { Detection } from "../../../types/ai/Records"
import { Main } from "../../../types/IPC/Main"
import { sendMain } from "../../IPC/main"
import { ai } from "../../stores"

export function logDetection(detection: Detection) {
    if (!get(ai).detectionLog) return
    sendMain(Main.SERVICE_RECORDS, { action: "detection", detection })
}

/** logs older than 90 days are deleted, whether or not logging is still on */
export const tidyDetectionLogs = () => sendMain(Main.SERVICE_RECORDS, { action: "prune" })

export const openDetectionLogs = () => sendMain(Main.SERVICE_RECORDS, { action: "open-detections" })
