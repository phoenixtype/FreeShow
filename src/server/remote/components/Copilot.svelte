<script lang="ts">
    import Button from "../../common/components/Button.svelte"
    import { send } from "../util/socket"
    import { copilot } from "../util/stores"

    $: state = $copilot?.on ? $copilot : null
    $: who = state?.locked ? "The screen is locked" : state?.holder === "matthias" ? `${state.name} is leading the screen` : "The operator has the screen"
</script>

{#if state}
    <div class="copilot" role="group" aria-label="Live Copilot">
        <div class="row">
            <p>{state.listening ? "Listening" : "Not listening"}. {who}.</p>
            {#if state.holder !== "operator"}
                <Button variant="outlined" compact on:click={() => send("COPILOT", { action: "take" })}>Take the screen</Button>
            {/if}
        </div>

        {#if state.suggestion}
            <div class="row">
                <p>Found <strong>{state.suggestion.content}</strong>{state.suggestion.onScreen ? ", on screen" : ""}</p>
                {#if !state.suggestion.onScreen}
                    <Button variant="contained" compact disabled={state.locked} on:click={() => send("COPILOT", { action: "show", id: state?.suggestion?.id })}>Show</Button>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .copilot {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 12px;
        font-size: 0.9em;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 34px;
    }
    p {
        min-width: 0;
    }
</style>
