import { CHAPTER_PATTERN } from "./referenceDictionary"

export const COMMON_MISHEARINGS: Record<string, string> = {
    // Phonetic & ASR Mishearings
    palm: "psalm",
    psum: "psalm",
    psam: "psalm",
    salm: "psalm",
    palms: "psalms",
    genes: "genesis",
    joan: "jonah",
    ask: "exodus",
    genius: "genesis",
    exit: "exodus",
    josh: "joshua",
    ester: "esther",
    proverb: "proverbs",
    jeremy: "jeremiah",
    lamentation: "lamentations",
    jose: "joseph",
    hose: "hosea",
    jewel: "joel",
    mica: "micah",
    johny: "john",
    romance: "romans",
    corinthian: "corinthians",
    galatian: "galatians",
    ephesian: "ephesians",
    colossian: "colossians",
    collisions: "colossians",
    philman: "philemon",
    philamon: "philemon",
    filman: "philemon",
    hebrew: "hebrews",
    revelations: "revelation",
    revolution: "revelation",
    revolutions: "revelation",

    // Common Book Abbreviations
    mat: "matthew",
    matt: "matthew",
    gen: "genesis",
    ex: "exodus",
    lev: "leviticus",
    num: "numbers",
    deut: "deuteronomy",
    sam: "samuel",
    ps: "psalms",
    psa: "psalms",
    prov: "proverbs",
    eccl: "ecclesiastes",
    isa: "isaiah",
    jer: "jeremiah",
    dan: "daniel",
    hos: "hosea",
    hab: "habakkuk",
    zeph: "zephaniah",
    hag: "haggai",
    zech: "zechariah",
    mal: "malachi",
    rom: "romans",
    cor: "corinthians",
    gal: "galatians",
    eph: "ephesians",
    phil: "philippians",
    col: "colossians",
    thess: "thessalonians",
    tim: "timothy",
    heb: "hebrews",
    rev: "revelation",

    // Ordinal Number Mishearings
    thirst: "first",
    sec: "second",
    turd: "third",
    ford: "fourth",

    // Other Mishearings
    cha: "chapter"
}

// Everyday words and names as much as book names ("ask three questions", "Dan will pray"):
// read as a book only where a chapter number follows.
const NEEDS_NUMBER = new Set(["ask", "ex", "exit", "genius", "josh", "joan", "romance", "revolution", "revolutions", "mat", "dan", "sam", "tim", "gal", "col", "mal", "num", "gen", "rev", "rom", "phil", "cor"])
const NUMBER_FOLLOWS = new RegExp(`^\\.?\\s*(?:\\d|(?:${CHAPTER_PATTERN})\\s+[\\p{L}\\d])`, "u")

export function normalizeMishearings(text: string): string {
    let normalized = text.toLowerCase()

    // as the speech model writes them for a West African accent
    normalized = normalized
        .replace(/\b(?:fast|face|fest) (?=(?:samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)\b)/g, "first ")
        .replace(/\bvast?r(?:e|i|ee)\b/g, "verse three")
        .replace(/\b(?:vas|vass|vers|versus)(?= (?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty))/g, "verse")

    const mishearingKeys = Object.keys(COMMON_MISHEARINGS).sort((a, b) => b.length - a.length)
    const mishearingRegex = new RegExp(`(?<!\\p{L})(${mishearingKeys.join("|")})(?!\\p{L})`, "giu")

    return normalized.replace(mishearingRegex, (match, _word, offset: number, all: string) => {
        const said = match.toLowerCase()
        if (NEEDS_NUMBER.has(said) && !NUMBER_FOLLOWS.test(all.slice(offset + match.length))) return match
        return COMMON_MISHEARINGS[said] || match
    })
}
