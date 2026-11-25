// "back to the chorus", "bridge", "verse two": the slide of the song that begins it.

export interface SectionSlide {
    /** where it stands in the song */
    index: number
    /** the slide itself: a chorus sung three times is one slide, three times over */
    id: string
    group: string
}

const plain = (group: string) => group.toLowerCase().replace(/[^a-z0-9]/g, "")
const SAME: Record<string, string> = { refrain: "chorus", ending: "outro" }

export function findSection(slides: SectionSlide[], name: string, number: number | undefined, current: number): number | null {
    const wanted = plain(name)
    const bases = [wanted, SAME[wanted]].filter(Boolean)
    const matches = slides.map((slide) => ({ ...slide, base: plain(slide.group).replace(/\d+$/, ""), number: Number(plain(slide.group).match(/\d+$/)?.[0]) || 0 })).filter((slide) => bases.includes(slide.base))
    if (!matches.length) return null

    let of = matches
    if (number) {
        const named = matches.filter((slide) => slide.number === number)
        const ids = [...new Set(matches.map((slide) => slide.id))]
        of = named.length ? named : matches.filter((slide) => slide.id === ids[number - 1])
        if (!of.length) return null
    }
    // the one coming up, else the first
    return (of.find((slide) => slide.index > current) || of[0]).index
}
