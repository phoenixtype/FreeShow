<script lang="ts">
    import { onDestroy } from "svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { ai, outLocked } from "../../../stores"
    import { handBack, heldUntil, screenHolder, setAgentMode } from "../../agent/control"
    import { NAME } from "../../voice/matthias"

    export let listening = true

    let now = Date.now()
    const clock = setInterval(() => (now = Date.now()), 500)
    onDestroy(() => clearInterval(clock))

    $: holder = screenHolder(!!$ai.matthias?.agentMode, $heldUntil, now)
    $: seconds = Math.max(1, Math.ceil(($heldUntil - now) / 1000))
    $: text = $outLocked ? "The screen is locked" : holder === "held" ? `You have the screen for ${seconds} s` : holder === "operator" ? "You have the screen" : listening ? `${NAME} is leading the screen` : `${NAME} leads, but is not listening`
</script>

<div class="control" class:leading={holder === "matthias" && !$outLocked && listening} role="group" aria-label="Who has the screen">
    <span class="dot" aria-hidden="true"></span>
    <p>{text}</p>
    {#if $outLocked}
        <MaterialButton variant="outlined" small on:click={() => outLocked.set(false)}>Unlock</MaterialButton>
    {:else if holder === "operator"}
        <MaterialButton variant="outlined" small title="Agent mode" on:click={() => setAgentMode(true)}>Let {NAME} lead</MaterialButton>
    {:else}
        {#if holder === "held"}
            <MaterialButton variant="outlined" small on:click={handBack}>Hand back</MaterialButton>
        {/if}
        <MaterialButton variant="outlined" small title="Leave agent mode" on:click={() => setAgentMode(false)}>{holder === "held" ? "Keep it" : "Take the screen"}</MaterialButton>
    {/if}
</div>

<style>
    .control {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 12px;
    }
    p {
        flex: 1;
        min-width: 0;
        white-space: initial;
        line-height: 1.3;
    }
    .dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--muted-text);
    }
    .leading .dot {
        background-color: var(--connected);
    }
</style>
