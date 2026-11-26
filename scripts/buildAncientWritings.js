// Builds public/ancient-writings.json, the "Other ancient writings" shipped in the
// app, from the Scriptural app's book files. Run again when those change:
//
//   node scripts/buildAncientWritings.js /path/to/scriptural
//
// A book whose license does not say public domain is left out.

const fs = require("fs")
const path = require("path")

const source = process.argv[2]
if (!source) throw new Error("Give the path to the Scriptural app: node scripts/buildAncientWritings.js /path/to/scriptural")

const booksFolder = path.join(source, "public", "extra-books")
const catalogue = fs.readFileSync(path.join(source, "src", "components", "bible-study", "utils", "extraBooks.ts"), "utf8")

const quoted = (block, key) => {
    const found = block.match(new RegExp(`\\b${key}: ("(?:[^"\\\\]|\\\\.)*")`))
    return found ? JSON.parse(found[1]) : ""
}
const details = new Map(
    catalogue
        .split(/\n {4}\{\n/)
        .slice(1)
        .map((block) => [quoted(block, "name"), { category: quoted(block, "category"), warning: quoted(block, "authenticityWarning") }])
)
const patriarchs = [...catalogue.match(/PATRIARCH_NAMES[^=]*= \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((a) => a[1])

const books = fs
    .readdirSync(booksFolder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(booksFolder, name), "utf8")))
    .filter((book) => {
        const free = /^public domain\b/i.test(book.license || "")
        if (!free) console.warn(`Left out, not public domain: ${book.book}`)
        return free
    })

for (const book of books) if (!details.get(book.book)?.warning) throw new Error(`No category or warning for ${book.book}`)

// Apocrypha first, then the rest; the twelve testaments stay in birth order
const group = (book) => (details.get(book.book).category === "Apocrypha" ? 0 : 1)
const sortName = (book) => (patriarchs.includes(book.book) ? `Testament ${String(patriarchs.indexOf(book.book)).padStart(2, "0")}` : book.book)
books.sort((a, b) => group(a) - group(b) || sortName(a).localeCompare(sortName(b), "en", { numeric: true }))

// "KJV Esther 10:4–13" is chapter 10 starting at verse 4; "KJV Esther 11" is chapter 11
function trueNumbers(book, index) {
    if (!book.chapterLabels) return { chapter: book.chapters[index].chapter, first: 1 }
    const label = book.chapterLabels[index].match(/ (\d+)(?::(\d+)[–-](\d+))?$/)
    if (!label) throw new Error(`Unreadable chapter label: ${book.chapterLabels[index]}`)
    const first = Number(label[2] || 1)
    if (label[3] && Number(label[3]) - first + 1 !== book.chapters[index].verses.length) throw new Error(`${book.chapterLabels[index]} does not match its verses`)
    return { chapter: Number(label[1]), first }
}

// angle brackets are the translator's marks, but would be read as HTML and dropped
// a footnote that ran into a verse ("... | Greek fragment from ...") is not part of it
const clean = (text) => text.replace(/\s*\|\s*Greek fragment.*$/s, "").replace(/</g, "⟨").replace(/>/g, "⟩").replace(/_{3,}/g, "").trim()

// the grid view shows these; the names would otherwise shorten to the same few letters
function shorten(name) {
    const testament = name.match(/^Testament of (\w+)/)
    if (testament) return `T.${testament[1].slice(0, 3)}`
    if (name === "Wisdom of Solomon") return "Wisd"
    const words = name.split(" ").filter((w) => !["of", "the", "to", "and"].includes(w))
    const number = /^\d$/.test(words[0]) ? words.shift() : ""
    const last = words[words.length - 1]
    return number + (/^\d+$/.test(last) ? `${words[0].slice(0, 2)}${last}` : last.slice(0, 4))
}

const bible = {
    name: "Other ancient writings",
    metadata: { title: "Other ancient writings", identifier: "ANCIENT", language: "en", copyright: "Public domain translations", ancientWritings: "true" },
    // numbered from 201, so a reference to a Bible book never lands on one of these
    books: books.map((book, i) => ({
        number: 201 + i,
        name: book.book,
        abbreviation: shorten(book.book),
        group: group(book) === 0 ? "Apocrypha" : "Other writings",
        warning: details.get(book.book).warning,
        translation: book.translation,
        source: book.source,
        license: book.license,
        chapters: book.chapters.map((chapter, c) => {
            const { chapter: number, first } = trueNumbers(book, c)
            return { number, verses: chapter.verses.map((text, v) => ({ number: first + v, text: clean(text) })) }
        })
    }))
}

const target = path.join(__dirname, "..", "public", "ancient-writings.json")
fs.writeFileSync(target, JSON.stringify(bible) + "\n")
console.log(`${bible.books.length} books written to ${target}`)
