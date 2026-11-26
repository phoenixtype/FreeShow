<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import T from "../../../components/helpers/T.svelte"
    import { ai, dictionary } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { NAME } from "../../voice/matthias"

    function updateValue(kind: "scripture" | "lyrics", value: any) {
        ai.update((a) => {
            a[kind] = { ...(a[kind] || {}), confidence: value }
            return a
        })
    }

    function setWay(way: "verseCue" | "events" | "commands", value: boolean) {
        ai.update((a) => {
            a.scripture = { ...(a.scripture || {}), [way]: value }
            return a
        })
    }

    $: confidenceOptions = [
        { value: "ask", label: translateText("matthias.ask_first", $dictionary) },
        { value: "highest", label: translateText("matthias.put_up_certain", $dictionary), data: "95%" },
        { value: "high", label: translateText("matthias.put_up_fairly", $dictionary), data: "75%" },
        { value: "medium", label: translateText("matthias.put_up_guess", $dictionary), data: "50%" }
    ]
</script>

<Title label="matthias.hears_scripture" icon="scripture" />

<MaterialDropdown label="matthias.then" options={confidenceOptions} value={$ai.scripture?.confidence || "ask"} on:change={(e) => updateValue("scripture", e.detail)} />
<MaterialToggleSwitch label="matthias.ai_detect" checked={!!$ai.llm?.detect} on:change={(e) => ai.update((a) => ({ ...a, llm: { ...(a.llm || {}), detect: e.detail } }))} />
<p class="note"><T id="matthias.ai_detect_note" /></p>
<MaterialToggleSwitch label="matthias.verse_cue" checked={$ai.scripture?.verseCue !== false} defaultValue={true} on:change={(e) => setWay("verseCue", e.detail)} />
<MaterialToggleSwitch label="matthias.bible_events" checked={$ai.scripture?.events !== false} defaultValue={true} on:change={(e) => setWay("events", e.detail)} />
<MaterialToggleSwitch label={translateText("matthias.spoken_commands", $dictionary, ["next verse"])} checked={$ai.scripture?.commands !== false} defaultValue={true} on:change={(e) => setWay("commands", e.detail)} />
<p class="note"><T id="matthias.requests_by_name" replace={[NAME]} /></p>

<!-- songs in the library, recognised while they are sung; once one is up it follows the singing -->
<Title label="matthias.hears_song" icon="song" />

<MaterialDropdown label="matthias.then" options={confidenceOptions} value={$ai.lyrics?.confidence || "ask"} on:change={(e) => updateValue("lyrics", e.detail)} />
<p class="note"><T id="matthias.song_follow_note" /></p>

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
    }
</style>
