<script lang="ts">
    import Title from "../../../components/input/Title.svelte"
    import MaterialDropdown from "../../../components/inputs/MaterialDropdown.svelte"
    import { ai } from "../../../stores"
    import { translateText } from "../../../utils/language"

    function updateValue(kind: "scripture" | "lyrics", value: any) {
        ai.update((a) => {
            a[kind] = { ...(a[kind] || {}), confidence: value }
            return a
        })
    }

    const confidenceOptions = [
        { value: "ask", label: translateText("ai.confidence_ask") },
        { value: "highest", label: translateText("ai.confidence_highest"), data: "> 95%" },
        { value: "high", label: translateText("ai.confidence_high"), data: "> 75%" },
        { value: "medium", label: translateText("ai.confidence_medium"), data: "> 50%" }
    ]
</script>

<Title label="tabs.scripture" icon="scripture" />

<MaterialDropdown label="ai.auto_present" options={confidenceOptions} value={$ai.scripture?.confidence || "ask"} on:change={(e) => updateValue("scripture", e.detail)} />

<!-- songs in the library, recognised while they are sung; once one is up it follows the singing -->
<Title label="category.song" icon="song" />

<MaterialDropdown label="ai.auto_present" options={confidenceOptions} value={$ai.lyrics?.confidence || "ask"} on:change={(e) => updateValue("lyrics", e.detail)} />
