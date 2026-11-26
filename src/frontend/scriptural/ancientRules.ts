// "Other ancient writings" are read like any local Bible, but are not most
// churches' Bible: nothing heard or spoken may use them. The operator picks.

import { get } from "svelte/store"
import { scriptures } from "../stores"

// books are numbered from here, so a reference to a Bible book never lands on one
export const ANCIENT_FIRST_BOOK = 201

const marked = (id: string) => !!get(scriptures)[id]?.ancientWritings

/** also true for a collection that holds them */
export function isAncientWritings(id: string): boolean {
    return marked(id) || !!get(scriptures)[id]?.collection?.versions?.some(marked)
}

/** the local entry, when they have been added */
export function ancientId(): string | null {
    return Object.keys(get(scriptures)).find(marked) || null
}

/** the Bible that listening reads in place of this one: itself, unless it holds the ancient writings */
export function listeningBibleId(id: string): string {
    if (!isAncientWritings(id)) return id
    return Object.keys(get(scriptures)).find((other) => !isAncientWritings(other)) || ""
}

/** false for a Bible book asked of the ancient writings, and the other way round */
export function bookFitsBible(id: string, book: number | string): boolean {
    return marked(id) === Number(book) >= ANCIENT_FIRST_BOOK
}

/**
 * For references asked of the app rather than picked in the Scripture tab. The
 * phone remote's picks are numbers ("201.4.7"); a named reference never resolves
 * into the ancient writings.
 */
export function refusesReference(id: string, reference: string): boolean {
    const numbered = reference.match(/^(\d+)\.\d+(\.|$)/)
    return numbered ? !bookFitsBible(id, numbered[1]) : isAncientWritings(id)
}
