<script lang="ts">
    import { OutputHelper } from "../../../components/helpers/OutputHelper"
    import { keysToID, sortByName } from "../../../components/helpers/array"
    import { isOutCleared } from "../../../components/helpers/output"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { clearAll, clearSlide } from "../../../components/output/clear"
    import PreviewOutput from "../../../components/output/preview/PreviewOutput.svelte"
    import { outLocked, outputs, outputState, shows } from "../../../stores"
    import { isScreenOff, onScreenTitle } from "./onScreen"

    // what the congregation sees, so the operator never has to leave the transcript to check
    $: screens = sortByName(keysToID($outputs).filter((a) => a.enabled && !a.stageOutput && !a.hideFromPreview))
    let chosenId = ""
    $: screen = screens.find((a) => a.id === chosenId) || screens.find((a) => a.active !== false) || screens[0]

    $: cleared = isOutCleared(null, $outputs)
    $: title = onScreenTitle(screen?.out?.slide, $shows)
    $: hidden = isScreenOff(screen?.id, $outputState) && !screen?.invisible
    $: status = !screen ? "" : cleared ? "Nothing on screen" : title || "On screen"
</script>

<section class="preview">
    <header>
        <p class="title" class:faded={cleared} title={status}>{status}</p>
        {#if $outLocked}
            <span class="tag">Locked</span>
        {:else if hidden}
            <span class="tag">Screen is off</span>
        {/if}
    </header>

    <div class="frame">
        {#if screen}
            {#key screen.id}
                <PreviewOutput outputId={screen.id} />
            {/key}
        {:else}
            <p class="empty">No screen is set up. Add one in Settings, Outputs.</p>
        {/if}
    </div>

    {#if screens.length > 1}
        <div class="screens">
            {#each screens as option}
                <MaterialButton small isActive={option.id === screen?.id} style="padding: 4px 10px;" on:click={() => (chosenId = option.id)}>{option.name}</MaterialButton>
            {/each}
        </div>
    {/if}

    <div class="controls">
        <MaterialButton icon="previous" title="preview._previous_slide" disabled={$outLocked || !screen || cleared} on:click={() => OutputHelper.advanceOutputs("previous", "copilot")} />
        <MaterialButton icon="next" title="preview._next_slide" disabled={$outLocked || !screen || cleared} on:click={() => OutputHelper.advanceOutputs("next", "copilot")} />
        <div class="fill" />
        <MaterialButton icon="slide" disabled={$outLocked || cleared} on:click={() => clearSlide()}>Clear words</MaterialButton>
        <MaterialButton icon="clear" disabled={$outLocked || cleared} on:click={() => clearAll(true)}>Clear all</MaterialButton>
    </div>
</section>

<style>
    .preview {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        min-height: 0;
    }

    header {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 24px;
    }
    .title {
        flex: 1;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .faded {
        opacity: 0.6;
        font-weight: normal;
    }
    .tag {
        font-size: 0.8em;
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        background-color: var(--primary-lighter);
        white-space: nowrap;
    }

    /* contains the preview's own absolutely positioned layers */
    .frame {
        position: relative;
        width: 100%;
        overflow: hidden;
        border-radius: var(--radius-sm);
        background-color: black;
    }
    .empty {
        padding: 40px 20px;
        text-align: center;
        white-space: initial;
        opacity: 0.7;
    }

    .screens {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .controls {
        display: flex;
        align-items: center;
        gap: 2px;
    }
    .fill {
        flex: 1;
    }
</style>
