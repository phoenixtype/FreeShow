// The words of a list slide from points a model gave. The model only supplies words;
// what is kept, how many, and how long is decided here.

export const MAX_POINTS = 8
export const MAX_POINT_CHARS = 90
export const MAX_TITLE_CHARS = 60

const clean = (value: unknown, max: number) =>
    String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/^[\s\-*\u2022\d.)]+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
        .trim()

export function listFromPoints(title: string, points: unknown): { title: string; text: string; count: number } | { error: string } {
    const name = clean(title, MAX_TITLE_CHARS)
    if (!name) return { error: "A list needs a title." }
    const kept = (Array.isArray(points) ? points : []).map((p) => clean(p, MAX_POINT_CHARS)).filter(Boolean)
    const unique = kept.filter((p, i) => kept.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i).slice(0, MAX_POINTS)
    if (unique.length < 2) return { error: "A list needs at least two points." }
    return { title: name, text: unique.map((p) => `\u2022 ${p}`).join("\n"), count: unique.length }
}
