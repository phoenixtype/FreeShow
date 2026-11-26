<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import { ai } from "../../../stores"

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

    const confidenceOptions = [
        { value: "ask", label: "Ask me first" },
        { value: "highest", label: "Put it up when it is certain", data: "95%" },
        { value: "high", label: "Put it up when it is fairly sure", data: "75%" },
        { value: "medium", label: "Put it up on a good guess", data: "50%" }
    ]
</script>

<Title label="When it hears scripture" icon="scripture" />

<MaterialDropdown label="Then" options={confidenceOptions} value={$ai.scripture?.confidence || "ask"} on:change={(e) => updateValue("scripture", e.detail)} />
<MaterialToggleSwitch label="Use AI to catch verses the words miss" checked={!!$ai.llm?.detect} on:change={(e) => ai.update((a) => ({ ...a, llm: { ...(a.llm || {}), detect: e.detail } }))} />
<p class="note">Off: verses are found on this computer only. On: what is heard is also sent to AI, which uses AI requests. Agent mode uses it too.</p>
<MaterialToggleSwitch label="Move on when the next verse number is read out" checked={$ai.scripture?.verseCue !== false} defaultValue={true} on:change={(e) => setWay("verseCue", e.detail)} />
<MaterialToggleSwitch label="Offer the passage when a Bible story is mentioned" checked={$ai.scripture?.events !== false} defaultValue={true} on:change={(e) => setWay("events", e.detail)} />
<MaterialToggleSwitch label="Obey spoken commands such as “next verse”" checked={$ai.scripture?.commands !== false} defaultValue={true} on:change={(e) => setWay("commands", e.detail)} />
<p class="note">Requests that start with “Matthias” work whether or not spoken commands are on.</p>

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
