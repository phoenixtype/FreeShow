<script lang="ts">
    import { startScripture } from "../../../components/actions/apiHelper"
    import { getShortBibleName } from "../../../components/drawer/bible/scripture"
    import T from "../../../components/helpers/T.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Center from "../../../components/system/Center.svelte"
    import { ai, aiSmartAction, aiSttStatus, aiSuggestions, outLocked, outputs, scriptures, shows, sttTranscript, transcriptLog } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import type { AiSuggestion } from "../../../../types/ai/Ai"
    import { getFirstActiveOutput } from "../../../components/helpers/output"
    import { readPassage } from "../../scripture/passage"
    import { Transcript } from "../../stt/transcript"

    import { createEventDispatcher } from "svelte"
    import { onScreenTitle } from "./onScreen"

    const dispatch = createEventDispatcher<{ listen: void }>()

    export let state: "loading" | "inactive" | "error" | "listening" | "processing" = "inactive"

    // the transcript follows the speech while pinned to the bottom - scrolling up to read
    // history stops the auto-jump until the user returns to the bottom
    let transcriptElem: HTMLElement | undefined
    let transcriptPinned = true
    let autoScrollTimer: NodeJS.Timeout | null = null
    $: if (transcriptPinned && ($sttTranscript.finalized || $sttTranscript.unprocessed) && transcriptElem) scrollToBottom()
    function scrollToBottom() {
        setTimeout(() => {
            if (!transcriptElem) return
            // already at the bottom: no scroll, and crucially no guard window that would swallow
            // a genuine user scroll gesture arriving between updates
            if (transcriptElem.scrollHeight - transcriptElem.scrollTop - transcriptElem.clientHeight < 2) return
            // the jump is instant (no smooth animation), so its single scroll event stays inside
            // this short guard instead of reading as a user unpin
            if (autoScrollTimer) clearTimeout(autoScrollTimer)
            autoScrollTimer = setTimeout(() => (autoScrollTimer = null), 150)
            transcriptElem.scrollTo(0, transcriptElem.scrollHeight)
        })
    }
    function onTranscriptScroll() {
        if (!transcriptElem || autoScrollTimer) return
        transcriptPinned = transcriptElem.scrollHeight - transcriptElem.scrollTop - transcriptElem.clientHeight < 40
    }

    const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    const SHOWN_LINES = 400
    $: shownLines = $transcriptLog.slice(-SHOWN_LINES)

    function toLatest() {
        transcriptPinned = true
        scrollToBottom()
    }

    const UNDO_MS = 10_000
    let undoClear: (() => void) | null = null
    let undoTimer: NodeJS.Timeout | null = null
    function clearLog() {
        undoClear = Transcript.clear()
        if (undoTimer) clearTimeout(undoTimer)
        undoTimer = setTimeout(() => (undoClear = null), UNDO_MS)
    }
    function putBack() {
        undoClear?.()
        undoClear = null
    }

    // SUGGESTIONS
    // confident suggestions surface here so the operator can present them with one click

    $: suggestions = $aiSuggestions

    function removeSuggestion(id: string) {
        aiSmartAction.update((cur) => (cur?.id === id ? null : cur))
        aiSuggestions.update((list) => list.filter((item) => item.id !== id))
    }

    function clearSuggestions() {
        aiSmartAction.set(null)
        aiSuggestions.set([])
    }

    // the words of each passage, so the operator reads it before the room does
    const isPassage = (suggestion: AiSuggestion) => suggestion.kind !== "song" && (suggestion.action === "present" || suggestion.action === "presented")
    let passages: { [key: string]: string } = {}
    const passageKey = (suggestion: AiSuggestion) => `${suggestion.scriptureTranslation || ""}:${suggestion.content}`
    $: loadPassages(suggestions)
    async function loadPassages(list: AiSuggestion[]) {
        for (const suggestion of list) {
            const key = passageKey(suggestion)
            if (!isPassage(suggestion) || passages[key] !== undefined) continue
            passages[key] = ""
            const passage = await readPassage(suggestion.content, suggestion.scriptureTranslation)
            passages = { ...passages, [key]: passage?.text || "" }
        }
    }

    $: liveTitle = onScreenTitle($outputs && getFirstActiveOutput()?.out?.slide, $shows)
    const sameReference = (a: string, b: string) => !!a && a.replace(/[–—]/g, "-").toLowerCase() === b.toLowerCase()

    const matchLabel = (confidence: number) => (confidence >= 95 ? "Certain" : confidence >= 75 ? "Likely" : "Possible")
</script>

<div class="columns">
    <section class="heard">
        {#if $transcriptLog.length || undoClear}
            <div class="log-head">
                <p>{undoClear ? "Cleared" : state === "listening" ? "Live" : "Transcription"}</p>
                {#if undoClear}
                    <MaterialButton small style="padding: 4px 10px;" on:click={putBack}>Undo</MaterialButton>
                {/if}
                {#if $transcriptLog.length}
                    {#if !transcriptPinned}<MaterialButton small style="padding: 4px 10px;" on:click={toLatest}>Latest</MaterialButton>{/if}
                    <MaterialButton small style="padding: 4px 10px;" on:click={() => Transcript.copy()}>Copy</MaterialButton>
                    <MaterialButton small style="padding: 4px 10px;" on:click={clearLog}>Clear</MaterialButton>
                {/if}
            </div>
        {/if}
        <div class="card-body">
            {#if state === "error"}
                <div class="message">
                    <p class="error">{translateText($aiSttStatus.message || "The microphone could not be opened.")}</p>
                    <MaterialButton variant="outlined" icon="refresh" on:click={() => dispatch("listen")}>Try again</MaterialButton>
                </div>
            {:else if state === "processing"}
                <div class="message">
                    <div class="spinner"></div>
                    <p><T id="ai.processing" /></p>
                </div>
            {:else if $transcriptLog.length || $sttTranscript.unprocessed}
                <div class="transcript-box" bind:this={transcriptElem} on:scroll={onTranscriptScroll}>
                    {#each shownLines as line}
                        <p><time>{time(line.at)}</time>{line.text}</p>
                    {/each}
                    {#if $sttTranscript.unprocessed}
                        <p><time>now</time><span class="interim">{$sttTranscript.unprocessed}</span></p>
                    {/if}
                </div>
            {:else if state === "inactive"}
                <div class="message">
                    <p>Not listening.</p>
                    <MaterialButton variant="outlined" icon="microphone" on:click={() => dispatch("listen")}>Start listening</MaterialButton>
                </div>
            {:else}
                <Center faded>
                    <p style="white-space: initial;padding: 0 20px;">{state === "loading" ? "Getting ready to listen…" : $ai.matthias?.name === false ? "Listening. Words appear here as they are spoken." : "Listening. You can say “Matthias, John three sixteen”."}</p>
                </Center>
            {/if}
        </div>

        {#if suggestions.length}
            <div class="suggestions-head">
                <p>Found</p>
                <MaterialButton small style="padding: 4px 10px;" on:click={clearSuggestions}>Clear list</MaterialButton>
            </div>
            <div class="suggestions-panel">
                {#each suggestions as suggestion (suggestion.id)}
                    {@const live = sameReference(liveTitle, suggestion.content)}
                    {@const words = passages[passageKey(suggestion)]}
                    <div class="suggestion" class:live>
                        <div class="about">
                            <p class="reference">
                                {suggestion.content}
                                {#if suggestion.scriptureTranslation}
                                    <span class="note">{getShortBibleName($scriptures[suggestion.scriptureTranslation]?.name)}</span>
                                {/if}
                                <span class="note">{live ? "On screen" : suggestion.action === "presented" ? "Shown" : suggestion.confidence ? matchLabel(suggestion.confidence) : ""}</span>
                            </p>
                            {#if words}<p class="words">{words}</p>{/if}
                        </div>

                        {#if suggestion.action === "open_scripture"}
                            <MaterialButton variant="outlined" small on:click={() => suggestion.trigger?.()}><T id="main.open" /></MaterialButton>
                        {:else}
                            {#if !live && suggestion.trigger}
                                <MaterialButton variant="outlined" small disabled={$outLocked} title="menu._title_display" on:click={() => suggestion.trigger?.()}>Show</MaterialButton>
                            {/if}
                            {#if isPassage(suggestion)}
                                <MaterialButton icon="scripture" title="main.open" style="padding: 6px;" on:click={() => startScripture({ id: suggestion.scriptureTranslation, reference: suggestion.content, play: false })} />
                            {/if}
                        {/if}
                        <MaterialButton icon="close" title="actions.remove" style="padding: 6px;" on:click={() => removeSuggestion(suggestion.id)} />
                    </div>
                {/each}
            </div>
        {/if}
    </section>
</div>

<style>
    .columns {
        flex: 1;
        min-height: 0;
        display: flex;
    }
    .heard {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .card-body {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .message {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 20px;
        text-align: center;
    }
    .message p {
        white-space: initial;
    }
    .error {
        color: #ff6b6b;
    }

    .transcript-box {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        font-size: 1rem;
        line-height: 1.5;
        cursor: text;
    }
    .transcript-box,
    .transcript-box p,
    .transcript-box span {
        user-select: text;
    }
    .transcript-box p {
        white-space: initial;
        overflow-wrap: anywhere;
        padding: 6px 16px;
    }
    .transcript-box time {
        margin-inline-end: 8px;
        font-size: 0.8em;
        color: var(--muted-text);
        font-variant-numeric: tabular-nums;
    }
    .log-head {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 8px 4px 16px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .log-head p {
        flex: 1;
        color: var(--muted-text);
    }
    .interim {
        opacity: 0.55;
    }

    .suggestions-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px 4px 16px;
        border-top: 1px solid var(--primary-lighter);
    }
    .suggestions-head p {
        opacity: 0.7;
    }

    .suggestions-panel {
        display: flex;
        flex-direction: column;
        max-height: 52%;
        overflow-y: auto;
        flex-shrink: 0;
    }

    .suggestion {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 8px 8px 16px;
        border-top: 1px solid var(--primary-lighter);
    }
    .suggestion.live {
        background-color: rgb(255 255 255 / 0.08);
    }
    .about {
        flex: 1;
        min-width: 0;
    }
    .reference {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .note {
        font-weight: normal;
        font-size: 0.85em;
        opacity: 0.7;
        margin-inline-start: 6px;
    }
    .words {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        white-space: initial;
        font-size: 0.9em;
        line-height: 1.35;
        opacity: 0.8;
    }

    .spinner {
        width: 28px;
        height: 28px;
        border: 2px solid var(--primary-lighter);
        border-top-color: var(--secondary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
