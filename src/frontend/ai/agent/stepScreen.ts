import { get } from "svelte/store"
import { OutputHelper } from "../../components/helpers/OutputHelper"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { loadJsonBible, scriptureDrawerOpen } from "../../components/drawer/bible/scripture"
import { outLocked } from "../../stores"
import { triggerFunction } from "../../utils/common"
import { resolveNavigation } from "../scripture/voiceNavigation"
import { currentScripture, otherTab, presentPassage } from "./presentPassage"

/** Next or previous, whatever is up: a verse follows its verse, a slide its slide. */
export async function stepScreen(direction: "next" | "previous") {
    if (get(outLocked)) return
    if (getFirstActiveOutput()?.out?.slide?.id !== "temp") return OutputHelper.advanceOutputs(direction, "copilot")
    // the Scripture tab also steps through the parts of a long verse
    if (get(scriptureDrawerOpen)) return triggerFunction(`scripture_${direction}`)

    const { id, reference } = currentScripture()
    if (!id || !reference?.book) return
    const chapter = Number(reference.chapters[reference.chapters.length - 1])
    const verses = (reference.verses[reference.verses.length - 1] || []).map((v: string | number) => parseInt(String(v), 10)).filter((v: number) => !isNaN(v))
    if (!verses.length) return
    const book = (await loadJsonBible(id))?.data?.books?.find((b) => Number(b.number) === Number(reference.book))
    if (!book) return
    const target = resolveNavigation({ type: "verse-step", delta: direction === "next" ? 1 : -1 }, { chapter, verse: direction === "next" ? Math.max(...verses) : Math.min(...verses) }, { chapterCount: book.chapters.length, verseCount: (n) => book.chapters.find((c) => Number(c.number) === n)?.verses.length || 0 })
    if (target) await presentPassage(`${reference.book}.${target.chapter}.${target.verse}`, otherTab(id))
}
