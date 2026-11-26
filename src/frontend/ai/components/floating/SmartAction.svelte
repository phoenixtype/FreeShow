<script lang="ts">
    import { bubbleBottom } from "./bubblePosition"
    import { fly } from "svelte/transition"
    import { getShortBibleName } from "../../../components/drawer/bible/scripture"
    import Icon from "../../../components/helpers/Icon.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { ai, aiSmartAction, aiSuggestions, outputs, scriptures } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import ScreenControl from "./ScreenControl.svelte"
    import { askingToLead } from "../../agent/control"
    import MatthiasStatus from "./MatthiasStatus.svelte"
    import { matthiasStatus } from "../../voice/matthiasAgent"
    import { AiManager } from "../../manager/AiManager"
    import AiRing from "./AiRing.svelte"
    import ConfidenceMeter from "./ConfidenceMeter.svelte"

    export let listening = true

    $: smartAction = $aiSmartAction

    // asked again whenever the screen or the list changes
    const canUndo = (content: string, ..._changes: unknown[]) => AiManager.canUndo(content)
    function undo() {
        if (smartAction && AiManager.canUndo(smartAction.content)) AiManager.undoChange()
        aiSmartAction.set(null)
    }
</script>

<!-- this will show the latest transcript segment (& interim) -->
<!-- {#if !isOpen && isListening && ($sttTranscript.finalized || $sttTranscript.unprocessed)}
    <div class="ticker-wrap">
        <AiRing {state} {audioLevel} borderRadius="12px" borderWidth="1.5px">
            <button class="ticker" on:click={toggleExpand}>
                {$sttTranscript.finalized}{#if $sttTranscript.unprocessed}{" "}<span class="interim">{$sttTranscript.unprocessed}</span>{/if}
            </button>
        </AiRing>
    </div>
{/if} -->

{#if $matthiasStatus}
    <div class="ticker-wrap" style="bottom: {$bubbleBottom}px;" transition:fly={{ x: 40, duration: 200 }}>
        <div class="pill"><AiRing opacity={0.95} borderRadius="30px"><div><MatthiasStatus /></div></AiRing></div>
    </div>
{:else if smartAction?.action === "presented"}
    <div class="ticker-wrap" style="bottom: {$bubbleBottom}px;" transition:fly={{ x: 40, duration: 200 }}>
        <div class="pill">
            <AiRing opacity={0.85} borderRadius="30px">
                <div class="suggestion">
                    <MaterialButton style="padding: 8px 4px;gap: 8px;" title="actions.close" on:click={() => aiSmartAction.set(null)}>
                        <Icon id="check" white />
                        <p>Presented:</p>
                        <span style="font-weight: bold;">{smartAction.content}</span>
                    </MaterialButton>
                    {#if canUndo(smartAction.content, $outputs, $aiSuggestions)}
                        <MaterialButton variant="outlined" small on:click={undo}>Undo</MaterialButton>
                    {/if}
                </div>
            </AiRing>
        </div>
    </div>
{:else if smartAction}
    <div class="ticker-wrap" style="bottom: {$bubbleBottom}px;" transition:fly={{ x: 40, duration: 200 }}>
        <!-- border-radius: 50px 10px 10px 50px; -->
        <MaterialButton
            style="padding: 0;border-radius: 50px;"
            on:click={() => {
                if (smartAction?.trigger) {
                    smartAction.trigger()
                    setTimeout(() => aiSmartAction.set(null), 500)
                } else {
                    aiSmartAction.set(null)
                }
            }}
        >
            <!-- borderRadius="20px 10px 10px 20px" -->
            <AiRing opacity={0.85}>
                <div class="suggestion">
                    {#if smartAction?.action === "present"}
                        <Icon id="play" white />

                        <p>Click to present:</p>
                        <span style="font-weight: bold;">
                            {smartAction.content}

                            {#if smartAction?.scriptureTranslation}
                                <span class="translation">({getShortBibleName($scriptures[smartAction.scriptureTranslation]?.name)})</span>
                            {/if}
                        </span>
                    {:else if smartAction?.action === "present_song"}
                        <Icon id="song" white />

                        <p>In your library, click to present:</p>
                        <span style="font-weight: bold;">{smartAction.content}</span>
                    {:else if smartAction?.action === "open_scripture"}
                        <Icon id="scripture" white />

                        <p>{translateText("main.open")}:</p>
                        <span style="font-weight: bold;">
                            {smartAction.content}
                        </span>
                    {/if}

                    {#if smartAction?.confidence}
                        <ConfidenceMeter confidence={smartAction.confidence} />
                    {/if}
                </div>
            </AiRing>
        </MaterialButton>
    </div>
{:else if $ai.matthias?.agentMode || $askingToLead}
    <div class="ticker-wrap" style="bottom: {$bubbleBottom}px;">
        <AiRing opacity={0.95} borderRadius="30px"><div><ScreenControl {listening} /></div></AiRing>
    </div>
{/if}

<style>
    .ticker-wrap {
        display: flex;
        max-width: 60vw;

        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 4998;

        /* the ring's inner card is opaque; the drop shadow lifts it off whatever panel is behind */
        filter: drop-shadow(0 8px 25px rgba(0, 0, 0, 0.5));
    }

    .suggestion {
        display: flex;
        align-items: center;
        gap: 8px;

        padding: 8px 12px;
    }
</style>
