import { COMPOUND_CONNECTORS, HUNDREDS_WORDS, MULTILINGUAL_RANGE_WORDS, ORDINAL_UNIT_WORDS, REVERSE_COMPOUND_CONNECTORS, REVERSE_COMPOUND_TENS, REVERSE_COMPOUND_UNITS, SPECIAL_COMPLEX_NUMBERS, TEEN_WORDS, TENS_WORDS, UNIT_WORDS, type ByLanguage } from "./numberDictionary"

const CONNECTOR_PATTERN = COMPOUND_CONNECTORS.join("|")
const RANGE_WORD_PATTERN = MULTILINGUAL_RANGE_WORDS.sort((a, b) => b.length - a.length).join("|")
const RANGE_REGEX = new RegExp(`\\b(\\d+)\\s*[,:]?\\s*(?:${RANGE_WORD_PATTERN})\\s*(\\d+)\\b`, "giu")

// German / Dutch / Norwegian reverse compounds like "einundzwanzig" (21), "eenentwintig" (21), "enogtjue" (21)
const REVERSE_COMPOUND_REGEX = new RegExp(`\\b(${REVERSE_COMPOUND_UNITS.join("|")})(?:${REVERSE_COMPOUND_CONNECTORS.join("|")})(${REVERSE_COMPOUND_TENS.join("|")})\\b`, "giu")

const byLength = (words: string[]) => [...new Set(words)].sort((a, b) => b.length - a.length).join("|")

/** the number words of English and the spoken language; every language when it is not known */
function numberWords(language?: string) {
    const codes = language === undefined || language === "any" ? Object.keys(UNIT_WORDS) : ["en", language]
    const pick = (record: ByLanguage): Record<string, number> => Object.assign({}, ...Object.entries(record).map(([code, words]) => (codes.includes(code) ? words : {})))

    const units = pick(UNIT_WORDS)
    const tens = pick(TENS_WORDS)
    const ordinals = pick(ORDINAL_UNIT_WORDS)
    const hundreds = pick(HUNDREDS_WORDS)
    const special = pick(SPECIAL_COMPLEX_NUMBERS)
    const all: Record<string, number> = { ...units, ...pick(TEEN_WORDS), ...tens, ...ordinals, ...hundreds, ...special }

    const every = byLength(Object.keys(all))
    return {
        units,
        tens,
        ordinals,
        hundreds,
        special,
        all,
        compound: new RegExp(`\\b(${byLength(Object.keys(tens))})(?:[\\s-]+(?:${CONNECTOR_PATTERN})[\\s-]+|[\\s-]*)(${byLength([...Object.keys(units), ...Object.keys(ordinals)])})\\b`, "giu"),
        specialRegex: Object.keys(special).length ? new RegExp(`\\b(${byLength(Object.keys(special))})\\b`, "giu") : null,
        single: new RegExp(`\\b(${every})\\b`, "giu"),
        // matches "2 cent 16", "deux cents seize", "to hundre og seksten", "one hundred and nineteen", etc.
        hundred: new RegExp(`\\b(?:(\\d+|${byLength([...Object.keys(units), ...Object.keys(ordinals)])})\\s*)?(${byLength(Object.keys(hundreds))})\\s*(?:(?:${CONNECTOR_PATTERN})\\s*)?(\\d+|${every})?\\b`, "giu")
    }
}

const compiled = new Map<string | undefined, ReturnType<typeof numberWords>>()
function wordsFor(language?: string) {
    let words = compiled.get(language)
    if (!words) compiled.set(language, (words = numberWords(language)))
    return words
}

export function normalizeNumbers(text: string, language?: string): string {
    const words = wordsFor(language)
    let normalized = text.toLowerCase()

    // 1. Normalize "hundred" numbers (e.g., "deux cent seize" -> "216", "one hundred and nineteen" -> "119")
    normalized = normalized.replace(words.hundred, (_match, hundredMultiplier, hundredWord, remainder) => {
        const baseHundredVal = words.hundreds[hundredWord.toLowerCase()] || 100
        let mult = 1
        if (hundredMultiplier) {
            mult = words.all[hundredMultiplier.toLowerCase()] || parseInt(hundredMultiplier, 10) || 1
        }

        let rem = 0
        if (remainder) {
            rem = words.all[remainder.toLowerCase()] || parseInt(remainder, 10) || 0
        }

        // If baseHundredVal already includes multiplier (e.g. doscientos = 200), don't multiply again
        const hundredTotal = baseHundredVal >= 200 ? baseHundredVal : mult * baseHundredVal
        return (hundredTotal + rem).toString()
    })

    // 2. Normalize special complex numbers (e.g. French "soixante-seize" -> 76, "quatre-vingt-dix-neuf" -> 99)
    if (words.specialRegex)
        normalized = normalized.replace(words.specialRegex, (match) => {
            const val = words.special[match.toLowerCase()]
            return val !== undefined ? val.toString() : match
        })

    // 3. Normalize German / Dutch / Norwegian reverse compounds (e.g. "einundzwanzig" -> "21", "eenentwintig" -> "21", "enogtjue" -> "21")
    normalized = normalized.replace(REVERSE_COMPOUND_REGEX, (_, unit, tens) => {
        const unitVal = words.units[unit.toLowerCase()]
        const tensVal = words.tens[tens.toLowerCase()]
        return unitVal && tensVal ? (tensVal + unitVal).toString() : _
    })

    // 4. Normalize standard compound tens + units (e.g., "twenty five" -> "25", "vingt-trois" -> "23", "treinta y cinco" -> "35")
    normalized = normalized.replace(words.compound, (_, tens, units) => {
        const tensVal = words.tens[tens.toLowerCase()] || 0
        const unitsVal = words.units[units.toLowerCase()] || words.ordinals[units.toLowerCase()] || 0
        return (tensVal + unitsVal).toString()
    })

    // 5. Convert single-word cardinal and ordinal numbers ("trois" -> "3", "seize" -> "16", "eighth" -> "8")
    normalized = normalized.replace(words.single, (match, _word, offset: number) => {
        // "to" is two in Norwegian, and in English the word before every book: "turn to John"
        if (match === "to" && !/(?:kapittel|kap\.?|vers)\s*$/u.test(normalized.slice(0, offset))) return match
        const val = words.all[match.toLowerCase()]
        return val !== undefined ? val.toString() : match
    })

    // 6. Normalize range keyword patterns (e.g., "1 through 6" -> "1-6", "1 à 6" -> "1-6", "1 bis 6" -> "1-6")
    normalized = normalized.replace(RANGE_REGEX, "$1-$2")

    return normalized
}
