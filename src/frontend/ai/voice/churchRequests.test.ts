import { expect, it } from "vitest"
import { namesWhatToShow, parseRequests } from "./matthias"

// What people say and type in a church meeting, and what is meant. Add the ones that fail in
// real use here first.
const SAID: Record<string, string[]> = {
    show: ["show John 3:16", "put up Psalm 23", "please show Romans eight verse twenty eight on the screen", "turn to Ephesians 2", "let us read Genesis one one", "go to Matthew chapter five verse three", "pull up First Corinthians thirteen", "I would like you to show Isaiah 53 5", "please bring up Amazing Grace", "could you put up the announcements", "display the offering slide", "open Philippians four six", "project the sermon notes"],
    navigate: ["next verse", "previous verse", "go to verse 10", "next chapter", "last verse", "read on", "keep reading", "continue reading", "from the top", "go on", "first verse please", "back"],
    slide: ["next slide", "previous slide", "go forward two slides", "next three verses", "go back 2 slides", "next line"],
    "goto-slide": ["slide three", "go to slide 4", "last slide", "first slide"],
    section: ["chorus", "back to the chorus", "take us back to the bridge", "repeat the chorus", "chorus again", "go to the bridge please", "sing verse two", "outro", "show the pre-chorus"],
    song: ["sing Amazing Grace", "play How Great Thou Art", "let's sing Way Maker", "the hymn Blessed Assurance", "start the song Holy Forever", "show the song Goodness of God"],
    search: ["find the verse about being anxious", "what does the Bible say about forgiveness", "search for love is patient", "where does it say be still and know", "show me a scripture about healing", "look up the passage about the prodigal son", "give us a verse on giving", "which verse says I can do all things"],
    result: ["another one", "not that one", "next result", "wrong one"],
    version: ["use the NLT", "switch to King James", "read it in the message", "change the version to NIV", "show it in the Amplified", "change it to ESV"],
    clear: ["clear the screen", "take it down", "clear everything", "black", "go blank", "remove it", "take down the verse", "clear the lyrics", "black out", "take the song off", "remove everything", "hide it"],
    "clear-layer": ["clear the background", "remove the overlay", "hide the background"],
    restore: ["bring it back", "put it back up", "undo", "restore the screen"],
    again: ["show that again", "once more", "repeat that", "put it up again"],
    before: ["go back to the last scripture", "back to the previous song", "show the previous passage again"],
    plan: ["start the service", "next item", "next song", "go to the next item in the plan", "previous item", "begin the programme"],
    "open-plan": ["open the plan Sunday morning", "open the Easter service plan", "open the project Youth Night"],
    "add-to-plan": ["add Amazing Grace to the plan", "put Way Maker in the service", "add the song Holy Forever to today's plan"],
    overlay: ["show the logo", "take down the logo", "put up the welcome overlay", "turn off the lower third overlay"],
    media: ["play the welcome video", "show the sunrise picture", "change the background to the mountains", "run the announcement clip", "put up the cross image"],
    audio: ["stop the music", "mute the sound", "unmute", "fade out the music", "turn off the pad"],
    countdown: ["start a five minute countdown", "set a timer for ten minutes", "give the preacher thirty minutes", "add two minutes", "give him five more minutes", "start a 30 second timer"],
    timer: ["start the timer", "pause the timer", "stop the countdown", "next segment"],
    lock: ["lock the screen", "unlock the screen", "freeze the screen"],
    screen: ["turn the screen on", "switch off the screen"],
    agent: ["take over", "stand down", "you drive", "hands off", "agent mode on", "let me drive"],
    listen: ["stop listening", "go to sleep"],
    page: ["open settings", "go to the scripture tab", "open the song library", "take me to the media page"],
    tell: ["what's on the screen", "what's next", "what can you do", "which song is this", "what verse is this"],
    // for the model: never to be put on screen by a guess
    unknown: ["make a plan for Sunday with Amazing Grace and Way Maker", "who wrote the book of Romans", "prepare the Easter service", "create a welcome slide", "remove Amazing Grace from the plan", "how many songs do we have", "is the projector working", "thank you"]
}

for (const [type, requests] of Object.entries(SAID)) {
    it(`${type}`, () => {
        const wrong = requests
            .map((words) => [
                words,
                parseRequests(words)
                    .map((r) => r.type)
                    .join(" + ")
            ])
            .filter(([, got]) => got !== type)
        expect(wrong).toEqual([])
    })
}

it("several in one breath", () => {
    const types = (words: string) => parseRequests(words).map((r) => r.type)
    expect(types("sing Way Maker then go to the chorus and lock the screen")).toEqual(["song", "section", "lock"])
    expect(types("clear the screen and stop the music")).toEqual(["clear", "audio"])
    expect(types("show Psalm 23 and after that start a five minute countdown")).toEqual(["show", "countdown"])
    expect(types("put up the welcome overlay then play the welcome video")).toEqual(["overlay", "media"])
})

it("a passage or song named on its own is looked up and shown", () => {
    for (const words of ["can we have Romans eight verse twenty eight on the screen please", "Psalm 91", "Way Maker"]) expect(namesWhatToShow(words.replace(/^can we have | on the screen please$/g, ""))).toBe(true)
})
