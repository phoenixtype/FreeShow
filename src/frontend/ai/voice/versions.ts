const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "")
const LETTERS: Record<string, string> = { en: "n", ell: "l", el: "l", tea: "t", tee: "t", kay: "k", jay: "j", vee: "v", be: "b", bee: "b", ess: "s", eye: "i", ay: "a", pea: "p", pee: "p", see: "c", sea: "c", em: "m", gee: "g" }

/** the Bible a spoken version name means: "NLT", "n l t", "new living", "king james", "message" */
export function matchVersion(spoken: string, list: { id: string; names: string[] }[]): string | null {
    const words = spoken
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .trim()
        .split(/\s+/)
    const said = compact(words.filter((w) => !["the", "version", "translation", "bible"].includes(w)).join(""))
    const spelled = words.map((w) => LETTERS[w] || w).join("")
    if (!said) return null

    const initials = (name: string) => compact(name.replace(/\b(the|of|and|translation|bible|edition)\b/gi, " ").replace(/\b(\w)\w*\s*/g, "$1"))
    const scored = list.map(({ id, names }) => {
        let score = 0
        for (const name of names) {
            const whole = compact(name)
            if (whole === said || whole === spelled) score = Math.max(score, 4)
            else if (compact(name.replace(/\b(the|version|translation|bible)\b/gi, "")) === said) score = Math.max(score, 4)
            else if (said.length >= 3 && (initials(name) === said || initials(name) === spelled)) score = Math.max(score, 3)
            else if (said.length >= 4 && whole.startsWith(said)) score = Math.max(score, 2)
            else if (said.length >= 5 && whole.includes(said)) score = Math.max(score, 1)
        }
        return { id, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.score ? scored[0].id : null
}
