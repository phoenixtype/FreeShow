import { expect, it } from "vitest"
import { CANON } from "./canon"
import { correctBookNames, nearestBook } from "./nearestBook"
import { CHAPTER_PATTERN, VERSE_PATTERN } from "./referenceDictionary"

const names = CANON.map((b) => b.name)
const fix = (text: string) => correctBookNames(text, names, CHAPTER_PATTERN, VERSE_PATTERN)

it("knows a misspelled book", () => {
    const heard: Record<string, string> = { josea: "hosea", maccah: "micah", macha: "micah", habaku: "habakkuk", habukuk: "habakkuk", zephania: "zephaniah", zekoriah: "zechariah", nehmiah: "nehemiah", nehom: "nahum", hagi: "haggai", juna: "jonah", pita: "peter", route: "ruth" }
    for (const [word, book] of Object.entries(heard)) expect(`${word} ${nearestBook(word, names)}`).toBe(`${word} ${book}`)
})
it("leaves every real book as it is", () => {
    for (const name of names) expect(fix(`read ${name.toLowerCase()} chapter 3 verse 5`)).toBe(`read ${name.toLowerCase()} chapter 3 verse 5`)
})
it("reads it only as part of a reference", () => {
    expect(fix("let us read josea chapter 3 verse 5")).toBe("let us read hosea chapter 3 verse 5")
    expect(fix("read 2 pita 3 verse 12")).toBe("read 2 peter 3 verse 12")
    expect(fix("shohabukuk chapter 2 verse 3")).toBe("habakkuk chapter 2 verse 3")
    expect(fix("we took the long route home")).toBe("we took the long route home")
    expect(fix("the same chapter 3 verse 5")).toBe("the same chapter 3 verse 5")
    expect(fix("finish the story chapter 3")).toBe("finish the story chapter 3")
    expect(fix("in this chapter 3 people")).toBe("in this chapter 3 people")
})
