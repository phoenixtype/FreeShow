// The pictures and videos the church has used, by the name of the file.

import { get } from "svelte/store"
import { media, projects } from "../../stores"
import { getExtension, getFileName, getMediaType, removeExtension } from "../../components/helpers/media"

export interface MediaItem {
    /** the file's path */
    id: string
    name: string
    kind: "image" | "video"
}

export function mediaList(): MediaItem[] {
    const paths = new Set(Object.keys(get(media)))
    Object.values(get(projects)).forEach((plan) => plan?.shows?.forEach((item) => (item.type === "image" || item.type === "video") && paths.add(item.id)))
    return [...paths].flatMap((id) => {
        const kind = getMediaType(getExtension(id))
        return kind === "image" || kind === "video" ? [{ id, name: removeExtension(getFileName(id)).replace(/[_-]+/g, " "), kind }] : []
    })
}
