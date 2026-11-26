<script lang="ts">
    import { keysToID, sortByName } from "../../../components/helpers/array"
    import { isOutCleared, toggleOutputs } from "../../../components/helpers/output"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { clearAll, clearSlide, restoreOutput } from "../../../components/output/clear"
    import PreviewOutput from "../../../components/output/preview/PreviewOutput.svelte"
    import { dictionary, outLocked, outputCache, outputs, outputState, shows } from "../../../stores"
    import T from "../../../components/helpers/T.svelte"
    import { translateText } from "../../../utils/language"
    import { stepScreen } from "../../agent/stepScreen"
    import { isScreenOff, onScreenTitle } from "./onScreen"

    // what the congregation sees, so the operator never has to leave the transcript to check
    $: screens = sortByName(keysToID($outputs).filter((a) => a.enabled && !a.stageOutput && !a.hideFromPreview))
    let chosenId = ""
    $: screen = screens.find((a) => a.id === chosenId) || screens.find((a) => a.active !== false) || screens[0]

    $: cleared = isOutCleared(null, $outputs)
    $: title = onScreenTitle(screen?.out?.slide, $shows)
    $: hidden = isScreenOff(screen?.id, $outputState) && !screen?.invisible
    $: status = !screen ? "" : cleared ? translateText("matthias.nothing_on_screen", $dictionary) : title || translateText("matthias.on_screen", $dictionary)
</script>

<section class="preview">
    <header>
        <p class="title" class:faded={cleared} title={status}>{status}</p>
        {#if $outLocked}
            <span class="tag"><T id="matthias.locked" /></span>
        {:else if hidden}
            <span class="tag" title={translateText("matthias.only_you", $dictionary)}><T id="matthias.screen_off" /></span>
            <MaterialButton variant="outlined" small on:click={() => toggleOutputs(null, { state: true })}><T id="matthias.turn_on" /></MaterialButton>
        {/if}
    </header>

    <div class="frame">
        {#if screen}
            {#key screen.id}
                <PreviewOutput outputId={screen.id} />
            {/key}
        {:else}
            <p class="empty"><T id="matthias.no_screen" /></p>
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
        <MaterialButton icon="previous" title="preview._previous_slide" disabled={$outLocked || !screen || cleared} on:click={() => stepScreen("previous")}><T id="matthias.previous" /></MaterialButton>
        <MaterialButton icon="next" title="preview._next_slide" disabled={$outLocked || !screen || cleared} on:click={() => stepScreen("next")}><T id="matthias.next" /></MaterialButton>
        <div class="fill" />
        {#if cleared && $outputCache && $outputCache.slide?.type !== "ppt"}
            <MaterialButton icon="reset" disabled={$outLocked} on:click={restoreOutput}><T id="matthias.bring_back" /></MaterialButton>
        {:else}
            <MaterialButton icon="slide" disabled={$outLocked || cleared} on:click={() => clearSlide()}><T id="matthias.clear_words" /></MaterialButton>
            <MaterialButton icon="clear" disabled={$outLocked || cleared} on:click={() => clearAll(true)}><T id="matthias.clear_all" /></MaterialButton>
        {/if}
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
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
    }
    .fill {
        flex: 1;
    }
</style>
