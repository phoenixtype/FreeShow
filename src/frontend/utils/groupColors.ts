// Scriptural has no purple: slide groups still on FreeShow's old default
// colours move to the new ones. A colour a church picked itself is kept.
const OLD_GROUP_COLORS: Record<string, [string, string]> = {
    bridge: ["#f52598", "#f97316"],
    chorus: ["#f525d2", "#14b8a6"],
    intro: ["#d525f5", "#64748b"],
    outro: ["#a525f5", "#94a3b8"],
    pre_chorus: ["#8825f5", "#0ea5e9"],
    tag: ["#7525f5", "#22c55e"],
    verse: ["#5825f5", "#3b82f6"]
}
export function recolorDefaultGroups(value: any) {
    if (!value || typeof value !== "object") return value
    const next = { ...value }
    for (const [id, [from, to]] of Object.entries(OLD_GROUP_COLORS)) {
        if (next[id]?.color?.toLowerCase() === from) next[id] = { ...next[id], color: to }
    }
    return next
}
