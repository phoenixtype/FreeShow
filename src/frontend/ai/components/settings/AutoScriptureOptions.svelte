<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import { ai } from "../../../stores"

    function updateValue(kind: "scripture" | "lyrics", value: any) {
        ai.update((a) => {
            a[kind] = { ...(a[kind] || {}), confidence: value }
            return a
        })
    }

    const confidenceOptions = [
        { value: "ask", label: "Ask me first" },
        { value: "highest", label: "Put it up when it is certain", data: "95%" },
        { value: "high", label: "Put it up when it is fairly sure", data: "75%" },
        { value: "medium", label: "Put it up on a good guess", data: "50%" }
    ]
</script>

<Title label="When it hears scripture" icon="scripture" />

<MaterialDropdown label="Then" options={confidenceOptions} value={$ai.scripture?.confidence || "ask"} on:change={(e) => updateValue("scripture", e.detail)} />

<!-- songs in the library, recognised while they are sung; once one is up it follows the singing -->
<Title label="When it hears a song from your library" icon="song" />

<MaterialDropdown label="Then" options={confidenceOptions} value={$ai.lyrics?.confidence || "ask"} on:change={(e) => updateValue("lyrics", e.detail)} />
<p class="note">Once a song is up, it moves to the line being sung. Moving a slide yourself pauses it for half a minute.</p>

<style>
    .note {
        opacity: 0.8;
        margin: 6px 0;
    }
</style>
