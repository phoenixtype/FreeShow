// How much of a word match is scripture, and how much is just English.
// Rarity is measured inside the Bible, where "going", "able", "very" or "work"
// are uncommon, so ordinary talk ("I am going to ask the...") matched a verse at
// full confidence. Everyday words count for little here, however rare they are
// in the text; a long unbroken run of them still counts, because people do not
// say eight words of a verse in order by accident.

const EVERYDAY_WORDS = new Set(
    (
        "a able about actually after again ago ah all almost already also alright always am an and angry another any anybody anyone anything anyway are around as ask asked asking at away " +
        "back be because been before being better big bit boy bring but by call called came can cannot car come comes coming could day days did didn do does doesn doing don done down " +
        "each eat else end enough even ever every everybody everyone everything fact family far few find first for friend friends from " +
        "gave get getting girl give go goes going gone gonna good got gotta great guess guy guys had happen happened hard has have haven he hear heard hello help her here him his home hot hour house how " +
        "if in into is isn it its job just keep kind knew know last late later let like listen little ll long look looking lot made make man many may maybe me mean men might mine money month more morning most mother mr much must my myself " +
        "name need never new next nice night no none nor not nothing now number of off often oh ok okay old on once one only or other others our out over own " +
        "part people person place please point pretty problem put question quite really remember right room " +
        "said same sat saturday saw say saying says school see seen send sent she should show sir sister sit so some somebody someone something sometimes soon sorry start started stay still stop story such sunday sure " +
        "take taken talk talking tell telling ten than thank thanks that the their them then there these they thing things think third this those though thought three through time times to today together told tomorrow tonight too took town tried try trying turn twelve two " +
        "uh um under until up us use used very wait walk want wanted warm was wasn water way we week well went were what when where whether which while who whole whom why wife will with without woman word words work worked working would wrong yeah year years yes yesterday yet you young your yourself"
    ).split(" ")
)

const EVERYDAY_WEIGHT = 0.75
const RUN_FREE_WORDS = 3
const RUN_WORD_WEIGHT = 1.5
const TELLING_IDF = 2
const LONG_RUN = 5

export const MIN_EVIDENCE = 8
export const PRESENT_EVIDENCE = 11

/**
 * words: the distinct verse words that were spoken, with how rare each is in the Bible.
 * One telling word ("truth" in "let me tell you the truth") is a coincidence, so it
 * takes two, or a run of words in the verse's own order.
 */
export function quoteEvidence(words: { word: string; idf: number }[], longestRun: number): number {
    const telling = words.filter(({ word, idf }) => idf >= TELLING_IDF && !EVERYDAY_WORDS.has(word))
    if (telling.length < 2 && longestRun < LONG_RUN) return 0

    const sum = words.reduce((total, { word, idf }) => total + (EVERYDAY_WORDS.has(word) ? Math.min(idf, EVERYDAY_WEIGHT) : idf), 0)
    return sum + Math.max(0, longestRun - RUN_FREE_WORDS) * RUN_WORD_WEIGHT
}
