<script lang="ts">
    import { onDestroy } from "svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { ai, dictionary, outLocked } from "../../../stores"
    import { askingToLead, handBack, heldUntil, screenHolder, setAgentMode } from "../../agent/control"
    import { NAME } from "../../voice/matthias"
    import T from "../../../components/helpers/T.svelte"
    import { translateText } from "../../../utils/language"
    import AgentConfirm from "./AgentConfirm.svelte"

    export let listening = true

    let now = Date.now()
    const clock = setInterval(() => (now = Date.now()), 500)
    onDestroy(() => clearInterval(clock))

    $: holder = screenHolder(!!$ai.matthias?.agentMode, $heldUntil, now)
    $: seconds = Math.max(1, Math.ceil(($heldUntil - now) / 1000))
    $: text = $outLocked ? translateText("matthias.screen_locked", $dictionary) : holder === "held" ? translateText("matthias.screen_held", $dictionary, [String(seconds)]) : holder === "operator" ? translateText("matthias.screen_yours", $dictionary) : listening ? translateText("matthias.leading", $dictionary, [NAME]) : translateText("matthias.leads_not_listening", $dictionary, [NAME])
</script>

{#if $askingToLead}
    <AgentConfirm />
{:else}
    <div class="control" class:leading={holder === "matthias" && !$outLocked && listening} role="group" aria-label={translateText("matthias.who_has_screen", $dictionary)}>
        <span class="dot" aria-hidden="true"></span>
        <p>{text}</p>
        {#if $outLocked}
            <MaterialButton variant="outlined" small on:click={() => outLocked.set(false)}><T id="matthias.unlock" /></MaterialButton>
        {:else if holder === "operator"}
            <MaterialButton variant="outlined" small title="matthias.agent_mode" on:click={() => setAgentMode(true)}><T id="matthias.let_lead" replace={[NAME]} /></MaterialButton>
        {:else}
            {#if holder === "held"}
                <MaterialButton variant="outlined" small on:click={handBack}><T id="matthias.hand_back" /></MaterialButton>
            {/if}
            <MaterialButton variant="outlined" small title="matthias.leave_agent_mode" on:click={() => setAgentMode(false)}>{holder === "held" ? translateText("matthias.keep_it", $dictionary) : translateText("matthias.take_screen", $dictionary)}</MaterialButton>
        {/if}
    </div>
{/if}

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
