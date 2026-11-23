// Shows are saved as files named after the show, and Windows and macOS file
// names ignore case. Two shows in one import named "Amazing Grace" and
// "amazing grace" would save to the same file and one would be lost, so every
// name in a batch is made unique, ignoring case, against the batch and the
// library before anything is saved.

export function uniqueNames(names: string[], taken: Iterable<string>): string[] {
    const used = new Set([...taken].map((n) => n.toLowerCase()))
    return names.map((name) => {
        const base = name.trim()
        let candidate = base
        let number = 2
        while (used.has(candidate.toLowerCase())) candidate = `${base} ${number++}`
        used.add(candidate.toLowerCase())
        return candidate
    })
}
