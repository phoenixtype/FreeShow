<script lang="ts">
    import { ai, drawSettings, drawTool, paintCache } from "../../stores"
    import { runAgentTool } from "../../ai/agent/agentTools"
    import { Matthias } from "../../ai/voice/matthiasAgent"
    import Icon from "../helpers/Icon.svelte"
    import T from "../helpers/T.svelte"
    import { clone } from "../helpers/array"
    import FloatingInputs from "../input/FloatingInputs.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"
    import MaterialCheckbox from "../inputs/MaterialCheckbox.svelte"
    import MaterialColorInput from "../inputs/MaterialColorInput.svelte"
    import MaterialNumberInput from "../inputs/MaterialNumberInput.svelte"
    import Tabs from "../main/Tabs.svelte"
    import { clearDrawing } from "../output/clear"

    const defaults = {
        focus: {
            color: "#000000",
            opacity: 0.8,
            size: 300,
            radius: 50,
            glow: true,
            hold: false
        },
        pointer: {
            color: "#FF0000",
            opacity: 0.8,
            size: 100,
            radius: 50,
            glow: false,
            hollow: true,
            hold: false
        },
        zoom: {
            size: 200,
            hold: false
        },
        particles: {
            color: "#1e1eb4",
            opacity: 0.8,
            size: 20,
            radius: 25,
            glow: false,
            hollow: false,
            hold: false
        },
        fill: {
            color: "#000000",
            opacity: 0.8,
            rainbow: false
        },
        paint: {
            color: "#ffffff",
            size: 10,
            straight: false,
            // not saved:
            threed: false,
            dots: false,
            link_to_slide: false,
            hold: true // always true
        }
    }

    $: tool = $drawTool

    // what each tool does, in the words a volunteer would use
    const hints: { [key: string]: string } = {
        focus: "Hold the mouse on the screen preview to dim everything but a spot.",
        pointer: "Hold the mouse on the screen preview to show a pointer.",
        zoom: "Hold and drag on the screen preview to zoom in.",
        particles: "Hold the mouse on the screen preview to scatter particles.",
        fill: "Covers the whole screen with a colour.",
        paint: "Hold the mouse and draw on the screen preview. What you draw shows on the screen."
    }

    let drawingNote = ""
    async function cleanUp() {
        const answer = await runAgentTool("clean_up_drawing", {})
        drawingNote = answer.ok ? "Drawing tidied." : answer.error || ""
        setTimeout(() => (drawingNote = ""), 3000)
    }

    const update = (value: any, key: string) => {
        drawSettings.update((a) => {
            a[tool][key] = value
            return a
        })
    }

    function reset() {
        drawSettings.update((a) => {
            a[tool] = clone(defaults[tool] || {})
            return a
        })
    }

    // $: if (!Object.keys($drawSettings[tool] || {}).length) reset()
    $: if (tool) adddMissingSettings()
    function adddMissingSettings() {
        drawSettings.update((a) => {
            if (!a[tool]) a[tool] = clone(defaults[tool])
            else {
                Object.entries(defaults[tool]).forEach(([key, value]) => {
                    if (a[tool][key] === undefined) a[tool][key] = value
                })
            }
            return a
        })
    }
</script>

<!-- {#if tool === "paint"}
    <MaterialButton style="background-color: var(--primary-darker);" disabled={!$paintCache?.length} on:click={clearDrawing} red={!!$paintCache?.length}>
        <Icon id="clear" size={1.2} white />
        <T id="clear.drawing" />
    </MaterialButton>
{/if} -->

<Tabs tabs={{ tool: { name: "draw." + tool, icon: tool } }} active="tool" />

<div class="main">
    {#if hints[tool]}<p class="hint">{hints[tool]}</p>{/if}
    {#if drawingNote && tool === "paint"}<p class="hint">{drawingNote}</p>{/if}

    {#each Object.entries($drawSettings[tool] || {}) as [key, value]}
        {@const hidden = key === "hold" && tool === "paint"}

        {#if !hidden}
            {#if key === "color"}
                <MaterialColorInput label="edit.color" {value} on:change={(e) => update(e.detail, key)} />
            {:else if key === "opacity"}
                <MaterialNumberInput label="edit.opacity" value={value * 10} min={1} max={10} on:change={(e) => update(e.detail / 10, key)} />
            {:else if key === "radius"}
                <MaterialNumberInput label="draw.radius" value={value * 2} max={100} on:change={(e) => update(e.detail / 2, key)} />
            {:else if key === "size"}
                <MaterialNumberInput label="edit.size" {value} min={1} max={2000} step={10} defaultValue={tool === "zoom" ? 100 : null} on:change={(e) => update(e.detail, key)} />
            {:else if key !== "clear"}
                <MaterialCheckbox label="draw.{key}" checked={value} on:change={(e) => update(e.detail, key)} />
            {/if}
        {/if}
    {/each}
</div>

<FloatingInputs>
    {#if tool === "paint"}
        <MaterialButton disabled={!$paintCache?.length} on:click={cleanUp}>
            <Icon id="check" size={1.2} white />
            Clean up
        </MaterialButton>
        {#if $ai.enabled}
            <MaterialButton on:click={() => Matthias.ask("Draw what the preacher is describing", true, true)}>
                <Icon id="ai" size={1.2} white />
                Matthias, draw this
            </MaterialButton>
        {/if}

        <MaterialButton disabled={!$paintCache?.length} on:click={clearDrawing} red={!!$paintCache?.length}>
            <Icon id="clear" size={1.2} white />
            <T id="clear.drawing" />
        </MaterialButton>

        <div class="divider" />
    {/if}

    {#if tool !== "paint" && $ai.enabled}
        <MaterialButton on:click={() => Matthias.ask("List the main points of what was said", true, true)}>
            <Icon id="list" size={1.2} white />
            List the points
        </MaterialButton>
    {/if}

    <MaterialButton icon="reset" title="actions.reset" on:click={reset} />
</FloatingInputs>

<style>
    .main {
        display: flex;
        flex-direction: column;
        overflow: auto;
        height: 100%;

        padding: 10px;
    }

    .hint {
        margin: 0 0 10px;
        font-size: 0.85em;
        color: var(--text);
        opacity: 0.7;
        overflow-wrap: anywhere;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
    }
</style>
