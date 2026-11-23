// Free models that run on the church's own computer through Ollama
// (https://ollama.com): no key, no plan, nothing leaves the building.

import { writable } from "svelte/store"
import { Main } from "../../../types/IPC/Main"
import { requestMain } from "../../IPC/main"

export const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download"

// smallest first; sizes are what Ollama downloads
export const RECOMMENDED_LOCAL_MODELS = [
    { id: "llama3.2:3b", name: "Llama 3.2 3B", size: "2 GB", note: "Fast on any recent laptop" },
    { id: "gemma3:4b", name: "Gemma 3 4B", size: "3.3 GB", note: "Recommended: good with scripture and songs" },
    { id: "gemma3:12b", name: "Gemma 3 12B", size: "8 GB", note: "Best answers; needs 16 GB of memory" }
]

// model id -> percent downloaded, while a download runs
export const localModelDownloads = writable<{ [model: string]: number }>({})

export function getOllamaStatus() {
    return requestMain(Main.AI_OLLAMA_STATUS)
}

export async function downloadLocalModel(model: string) {
    localModelDownloads.update((a) => ({ ...a, [model]: 0 }))
    // a model can take a long while on a slow connection
    const result = await requestMain(Main.AI_OLLAMA_PULL, { model }, undefined, 6 * 60 * 60 * 1000)
    localModelDownloads.update((a) => {
        delete a[model]
        return a
    })
    return result || { ok: false, error: "The download did not finish" }
}

export function isModelDownloaded(model: string, installed: string[]) {
    return installed.some((name) => name === model || name === `${model}:latest`)
}
