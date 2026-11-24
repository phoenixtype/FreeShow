// Ported from Scriptural's Live Copilot (scriptural.online).
// Zero-token semantic layer: a curated table of famous Bible events, parables
// and passages matched by keyword overlap. Sits between the regex tier
// (explicit references) and the network tiers (DB full-text search, cloud
// LLM) so that the phrases preachers actually say — "when Jesus walked on
// water", "the prodigal son", "David and Goliath" — resolve instantly,
// deterministically, and without an API call. The cloud tier remains the
// backstop for anything not in this table.

export interface BibleEventMatch {
    reference: string
    label: string
    confidence: number
    matchedPhrase: string
}

// [label, reference, ...trigger phrases]
// Phrase matching is stemmed-token-subset with a proximity window (below), so
// "when Jesus walked on the water" matches the phrase "jesus walked on water".
// Keep every phrase to >= 2 significant (non-stopword) tokens; prefer 3 where
// a 2-token phrase would be too generic in ordinary speech.
type EventRow = [label: string, reference: string, ...phrases: string[]]

const EVENTS: EventRow[] = [
    // --- Gospels: life of Jesus ---
    ["Jesus walks on water", "Matthew 14:22-33", "jesus walked on water", "walked on the water", "walking on the sea", "peter walked on water"],
    ["Feeding the five thousand", "Matthew 14:13-21", "feeding the five thousand", "fed five thousand", "five loaves two fish", "loaves and fishes"],
    ["Feeding the four thousand", "Matthew 15:32-39", "feeding the four thousand", "fed four thousand"],
    ["Jesus calms the storm", "Mark 4:35-41", "calmed the storm", "calms the storm", "peace be still", "rebuked the wind"],
    ["The transfiguration", "Matthew 17:1-13", "transfiguration", "transfigured before them"],
    ["The last supper", "Luke 22:7-23", "the last supper", "this is my body broken"],
    ["Garden of Gethsemane", "Matthew 26:36-46", "garden of gethsemane", "not my will but yours", "let this cup pass"],
    ["The crucifixion", "Luke 23:26-49", "the crucifixion", "jesus was crucified", "father forgive them", "it is finished"],
    ["The resurrection", "Matthew 28:1-10", "the resurrection", "he is risen", "empty tomb", "rose from the dead on the third day"],
    ["The ascension", "Acts 1:6-11", "the ascension", "ascended into heaven", "taken up into heaven"],
    ["Temptation in the wilderness", "Matthew 4:1-11", "tempted in the wilderness", "temptation of jesus", "man shall not live by bread alone"],
    ["Baptism of Jesus", "Matthew 3:13-17", "baptism of jesus", "jesus was baptized", "this is my beloved son"],
    ["Water into wine", "John 2:1-11", "water into wine", "wedding at cana", "turned water to wine"],
    ["Raising of Lazarus", "John 11:1-44", "raised lazarus", "lazarus come forth", "lazarus from the dead"],
    ["Healing blind Bartimaeus", "Mark 10:46-52", "blind bartimaeus", "son of david have mercy"],
    ["Woman at the well", "John 4:1-42", "woman at the well", "samaritan woman", "living water"],
    ["Nicodemus — born again", "John 3:1-21", "nicodemus", "you must be born again", "born of water and the spirit"],
    ["Zacchaeus", "Luke 19:1-10", "zacchaeus", "climbed the sycamore tree"],
    ["The rich young ruler", "Mark 10:17-27", "rich young ruler", "sell all you have", "eye of a needle"],
    ["The widow's offering", "Mark 12:41-44", "widows mite", "widows offering", "two small coins"],
    ["Triumphal entry", "Matthew 21:1-11", "triumphal entry", "hosanna in the highest", "rode into jerusalem on a donkey", "palm sunday"],
    ["Cleansing the temple", "Matthew 21:12-17", "cleansed the temple", "overturned the tables", "den of thieves", "house of prayer"],
    ["Peter's denial", "Luke 22:54-62", "peter denied jesus", "before the rooster crows", "peters denial"],
    ["Doubting Thomas", "John 20:24-29", "doubting thomas", "put your finger here", "blessed are those who have not seen"],
    ["Road to Emmaus", "Luke 24:13-35", "road to emmaus"],
    ["The great commission", "Matthew 28:16-20", "great commission", "go and make disciples", "go ye into all the world"],
    ["Day of Pentecost", "Acts 2:1-13", "day of pentecost", "tongues of fire", "rushing mighty wind"],
    ["Sermon on the mount", "Matthew 5:1-12", "sermon on the mount", "the beatitudes", "blessed are the poor in spirit", "blessed are the meek"],
    ["The Lord's prayer", "Matthew 6:9-13", "the lords prayer", "our father who art in heaven", "our father in heaven hallowed"],
    ["The golden rule", "Matthew 7:12", "golden rule", "do unto others"],
    ["Jesus and the children", "Mark 10:13-16", "let the little children come"],
    ["Woman caught in adultery", "John 8:1-11", "woman caught in adultery", "cast the first stone", "go and sin no more"],
    ["The vine and branches", "John 15:1-8", "vine and the branches", "i am the vine", "apart from me you can do nothing"],
    ["The good shepherd", "John 10:1-18", "i am the good shepherd", "lays down his life for the sheep"],
    ["Mary and Martha", "Luke 10:38-42", "mary and martha", "martha martha you are worried"],
    ["Washing the disciples' feet", "John 13:1-17", "washed the disciples feet", "washing their feet"],

    // --- Parables ---
    ["Parable of the prodigal son", "Luke 15:11-32", "prodigal son", "younger son squandered", "father ran to him"],
    ["Parable of the good samaritan", "Luke 10:25-37", "good samaritan", "who is my neighbor", "man went down from jerusalem to jericho"],
    ["Parable of the lost sheep", "Luke 15:1-7", "lost sheep", "leaves the ninety nine"],
    ["Parable of the lost coin", "Luke 15:8-10", "lost coin", "woman with ten coins"],
    ["Parable of the sower", "Matthew 13:1-23", "parable of the sower", "seed fell on good soil", "seed fell among thorns", "sower went out to sow"],
    ["Parable of the mustard seed", "Matthew 13:31-32", "mustard seed", "faith as small as a mustard seed"],
    ["Parable of the talents", "Matthew 25:14-30", "parable of the talents", "well done good and faithful servant"],
    ["Parable of the ten virgins", "Matthew 25:1-13", "ten virgins", "wise and foolish virgins", "bridegroom was delayed"],
    ["Wheat and the tares", "Matthew 13:24-30", "wheat and the tares", "wheat and weeds"],
    ["The unmerciful servant", "Matthew 18:21-35", "unmerciful servant", "unforgiving servant", "seventy times seven"],
    ["Workers in the vineyard", "Matthew 20:1-16", "workers in the vineyard", "laborers in the vineyard", "the last will be first"],
    ["Rich man and Lazarus", "Luke 16:19-31", "rich man and lazarus", "abrahams bosom", "abrahams side"],
    ["Pharisee and the tax collector", "Luke 18:9-14", "pharisee and the tax collector", "god have mercy on me a sinner"],
    ["The persistent widow", "Luke 18:1-8", "persistent widow", "unjust judge"],
    ["Wise and foolish builders", "Matthew 7:24-27", "wise man built his house", "house on the rock", "house on the sand", "wise and foolish builders"],
    ["The great banquet", "Luke 14:15-24", "great banquet", "wedding feast invitation"],
    ["The wicked tenants", "Mark 12:1-12", "wicked tenants", "vineyard tenants", "stone the builders rejected"],
    ["The rich fool", "Luke 12:13-21", "rich fool", "bigger barns", "tonight your soul is required"],
    ["Parable of the fig tree", "Luke 13:6-9", "parable of the fig tree", "barren fig tree"],

    // --- Old Testament ---
    ["The creation", "Genesis 1:1-31", "in the beginning god created", "creation of the world", "let there be light"],
    ["Garden of Eden", "Genesis 2:8-25", "garden of eden", "tree of the knowledge of good and evil"],
    ["The fall of man", "Genesis 3:1-24", "the fall of man", "adam and eve sinned", "the serpent deceived", "forbidden fruit"],
    ["Cain and Abel", "Genesis 4:1-16", "cain and abel", "am i my brothers keeper"],
    ["Noah's ark", "Genesis 6:9-22", "noahs ark", "noah built the ark", "the great flood", "flood came upon the earth"],
    ["Tower of Babel", "Genesis 11:1-9", "tower of babel", "confused their language"],
    ["Abraham offers Isaac", "Genesis 22:1-19", "abraham offered isaac", "sacrifice isaac", "god will provide the lamb", "jehovah jireh"],
    ["Sodom and Gomorrah", "Genesis 19:1-29", "sodom and gomorrah", "lots wife looked back", "pillar of salt"],
    ["Jacob's ladder", "Genesis 28:10-22", "jacobs ladder", "ladder reaching to heaven", "surely the lord is in this place"],
    ["Jacob wrestles with God", "Genesis 32:22-32", "jacob wrestled", "wrestled until daybreak", "i will not let you go unless you bless me"],
    ["Joseph and his coat", "Genesis 37:1-11", "coat of many colors", "josephs dreams"],
    ["Joseph sold into slavery", "Genesis 37:12-36", "joseph sold into slavery", "sold by his brothers", "sold into egypt"],
    ["Joseph forgives his brothers", "Genesis 45:1-15", "joseph forgave his brothers", "you meant evil against me", "god meant it for good"],
    ["The burning bush", "Exodus 3:1-15", "burning bush", "i am who i am", "take off your sandals holy ground"],
    ["The ten plagues", "Exodus 7:14-25", "ten plagues", "plagues of egypt", "let my people go"],
    ["The passover", "Exodus 12:1-30", "the passover lamb", "blood on the doorposts", "first passover"],
    ["Parting the Red Sea", "Exodus 14:13-31", "parted the red sea", "crossing the red sea", "walls of water", "red sea crossing"],
    ["The ten commandments", "Exodus 20:1-17", "ten commandments", "thou shalt not", "tablets of stone mount sinai"],
    ["The golden calf", "Exodus 32:1-35", "golden calf"],
    ["Manna from heaven", "Exodus 16:1-36", "manna from heaven", "bread from heaven in the wilderness"],
    ["Water from the rock", "Exodus 17:1-7", "water from the rock", "struck the rock"],
    ["Balaam's donkey", "Numbers 22:21-39", "balaams donkey", "donkey spoke", "talking donkey"],
    ["The bronze serpent", "Numbers 21:4-9", "bronze serpent", "serpent on a pole"],
    ["Walls of Jericho", "Joshua 6:1-27", "walls of jericho", "marched around the city", "walls came tumbling down"],
    ["Gideon and the fleece", "Judges 6:36-40", "gideons fleece", "fleece was wet"],
    ["Gideon's three hundred", "Judges 7:1-25", "gideons three hundred", "three hundred men lapped"],
    ["Samson and Delilah", "Judges 16:4-22", "samson and delilah", "cut his hair strength left"],
    ["Ruth and Boaz", "Ruth 2:1-23", "ruth and boaz", "gleaning in the field", "kinsman redeemer"],
    ["Hannah prays for a son", "1 Samuel 1:9-20", "hannah prayed for a child", "hannah and samuel"],
    // Range capped at the battle narrative — parseReference() rejects verse
    // ranges wider than 50, so a full-chapter 1-58 span would never surface.
    ["David and Goliath", "1 Samuel 17:32-51", "david and goliath", "five smooth stones", "sling and a stone", "giant of gath"],
    ["David and Bathsheba", "2 Samuel 11:1-27", "david and bathsheba"],
    ["David and Jonathan", "1 Samuel 18:1-4", "david and jonathan", "jonathans covenant with david"],
    ["Solomon's wisdom", "1 Kings 3:16-28", "solomons wisdom", "divide the baby", "two women one baby"],
    ["Elijah on Mount Carmel", "1 Kings 18:20-40", "prophets of baal", "mount carmel", "fire fell from heaven"],
    ["Elijah and the still small voice", "1 Kings 19:9-18", "still small voice", "gentle whisper"],
    ["Chariot of fire", "2 Kings 2:1-14", "chariot of fire", "elijah taken up in a whirlwind", "double portion of your spirit"],
    ["Naaman healed of leprosy", "2 Kings 5:1-19", "naaman", "dip seven times in the jordan"],
    ["Jonah and the great fish", "Jonah 1:1-17", "jonah and the whale", "jonah and the great fish", "swallowed by a fish", "three days in the belly"],
    ["Daniel in the lions' den", "Daniel 6:1-28", "daniel in the lions den", "shut the lions mouths"],
    ["The fiery furnace", "Daniel 3:1-30", "fiery furnace", "shadrach meshach and abednego", "fourth man in the fire"],
    ["Handwriting on the wall", "Daniel 5:1-31", "handwriting on the wall", "writing on the wall", "weighed in the balance"],
    ["Esther saves her people", "Esther 4:1-17", "esther saved her people", "for such a time as this"],
    ["Job's suffering", "Job 1:1-22", "the suffering of job", "job lost everything", "the lord gives and takes away"],
    ["Valley of dry bones", "Ezekiel 37:1-14", "valley of dry bones", "dry bones live", "dem bones"],
    ["Isaiah's commission", "Isaiah 6:1-8", "here am i send me", "isaiah saw the lord high and lifted up", "holy holy holy"],
    ["The suffering servant", "Isaiah 53:1-12", "suffering servant", "by his stripes we are healed", "wounded for our transgressions", "led like a lamb to the slaughter"],
    ["The Lord is my shepherd", "Psalms 23:1-6", "the lord is my shepherd", "valley of the shadow of death", "my cup overflows"],
    ["The fiery trial of faith", "Genesis 15:1-6", "abraham believed god", "counted to him as righteousness"],

    // --- Acts & epistles ---
    ["Road to Damascus", "Acts 9:1-19", "road to damascus", "saul saul why do you persecute me", "sauls conversion", "scales fell from his eyes"],
    ["Philip and the Ethiopian", "Acts 8:26-40", "ethiopian eunuch", "philip and the ethiopian"],
    ["Peter freed from prison", "Acts 12:1-19", "peter freed from prison", "angel freed peter"],
    ["Paul and Matthias in prison", "Acts 16:16-40", "paul and matthias", "singing hymns at midnight", "what must i do to be saved"],
    ["Paul's shipwreck", "Acts 27:13-44", "pauls shipwreck", "shipwrecked on malta"],
    ["The armor of God", "Ephesians 6:10-18", "armor of god", "sword of the spirit", "shield of faith", "belt of truth"],
    ["The love chapter", "1 Corinthians 13:1-13", "love is patient love is kind", "love chapter", "faith hope and love"],
    ["The faith chapter", "Hebrews 11:1-40", "faith is the substance of things hoped for", "hall of faith", "faith chapter", "assurance of things hoped for"],
    ["Fruit of the Spirit", "Galatians 5:22-23", "fruit of the spirit", "love joy peace patience"],
    ["The Word became flesh", "John 1:1-14", "in the beginning was the word", "word became flesh"],
    ["God so loved the world", "John 3:16", "god so loved the world", "whoever believes in him", "only begotten son"]
]

// Common English words carrying no matching signal.
const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "by",
    "with",
    "from",
    "into",
    "unto",
    "as",
    "is",
    "was",
    "were",
    "be",
    "been",
    "am",
    "are",
    "his",
    "her",
    "him",
    "he",
    "she",
    "it",
    "its",
    "their",
    "them",
    "they",
    "that",
    "this",
    "these",
    "those",
    "when",
    "where",
    "who",
    "whom",
    "which",
    "what",
    "how",
    "why",
    "you",
    "your",
    "we",
    "our",
    "us",
    "i",
    "me",
    "my",
    "do",
    "did",
    "does",
    "have",
    "has",
    "had",
    "will",
    "shall",
    "would",
    "not",
    "no",
    "but",
    "so",
    "then",
    "than",
    "there",
    "here",
    "out",
    "up",
    "down",
    "about",
    "all",
    "remember"
])

// Very light stemming — applied identically to phrases and input, so it only
// needs to be self-consistent, not linguistically correct.
function stem(token: string): string {
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3)
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2)
    if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2)
    if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1)
    return token
}

function significantTokens(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1 && !STOPWORDS.has(t))
        .map(stem)
}

interface CompiledPhrase {
    tokens: string[]
    raw: string
    reference: string
    label: string
}

// Phrases compiled once at module load.
const COMPILED: CompiledPhrase[] = EVENTS.flatMap(([label, reference, ...phrases]) => phrases.map((raw) => ({ raw, tokens: significantTokens(raw), reference, label })).filter((p) => p.tokens.length >= 2))

// Max token distance (in the significant-token stream) between the first and
// last matched phrase token. The transcript buffer spans up to 20 seconds of
// speech, so without a window, tokens from unrelated sentences could combine
// into a false match.
const PROXIMITY_WINDOW = 12

/** Every distinct reference in the events table (for validation/tests). */
export function getAllEventReferences(): string[] {
    return Array.from(new Set(EVENTS.map(([, reference]) => reference)))
}

/**
 * Detect famous Bible events/passages described in free-form speech.
 * Pure and synchronous — no network, no model. Returns matches sorted most
 * specific first (more matched tokens = higher confidence), deduped by
 * reference.
 */
export function detectBibleEvents(text: string): BibleEventMatch[] {
    const inputTokens = significantTokens(text)
    if (inputTokens.length === 0) return []

    // token -> positions in the input stream
    const positions = new Map<string, number[]>()
    inputTokens.forEach((t, i) => {
        const arr = positions.get(t)
        if (arr) arr.push(i)
        else positions.set(t, [i])
    })

    const matches: BibleEventMatch[] = []

    for (const phrase of COMPILED) {
        // All tokens must exist somewhere in the input...
        const tokenPositions = phrase.tokens.map((t) => positions.get(t))
        if (tokenPositions.some((p) => !p)) continue

        // ...and cluster within the proximity window around at least one
        // occurrence of the first token (anchor-based, so a stray earlier
        // occurrence of a common word can't inflate the span and cause a miss).
        const window = PROXIMITY_WINDOW + phrase.tokens.length
        const clustered = (tokenPositions[0] as number[]).some((anchor) => tokenPositions.every((pos) => (pos as number[]).some((p) => Math.abs(p - anchor) <= window)))
        if (!clustered) continue

        matches.push({
            reference: phrase.reference,
            label: phrase.label,
            // Longer phrases are more specific and less likely to fire on ordinary
            // speech; reflect that in confidence.
            confidence: phrase.tokens.length >= 3 ? 0.88 : 0.82,
            matchedPhrase: phrase.raw
        })
    }

    // Dedupe by reference, keeping the highest-confidence (most specific) match.
    const best = new Map<string, BibleEventMatch>()
    for (const m of matches) {
        const existing = best.get(m.reference)
        if (!existing || m.confidence > existing.confidence) best.set(m.reference, m)
    }

    return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence)
}
