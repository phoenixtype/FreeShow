<script lang="ts">
    // pick a plan, then how often to pay, then one button
    import { createEventDispatcher } from "svelte"
    import { PLAN_NAMES, PLANS, priceId, type PaidPlan, type PlanState } from "../../../../scriptural/churchAccount"
    import MaterialButton from "../../../inputs/MaterialButton.svelte"

    export let state: PlanState
    /** owners and admins: billing-checkout refuses anyone else */
    export let canPay: boolean

    const dispatch = createEventDispatcher<{ checkout: string; portal: null }>()

    let chosen: PaidPlan = "church"
    let yearly = false
    $: plan = PLANS.find((p) => p.id === chosen)!
</script>

<p>You are on the {PLAN_NAMES[state.plan] || state.plan} plan.{state.comped ? " It was given to your church, so there is nothing to pay." : ""}</p>

{#if !canPay}
    <p class="muted">Ask your church's owner or an admin to change the plan.</p>
{:else if state.canManageBilling}
    <p class="muted">Change plan, update the card, get invoices or cancel on the billing page.</p>
    <div class="actions">
        <MaterialButton variant="outlined" small on:click={() => dispatch("portal")}>Manage billing</MaterialButton>
    </div>
{:else if state.plan === "free"}
    <fieldset>
        <legend>Plan</legend>
        {#each PLANS as option (option.id)}
            <label>
                <input type="radio" bind:group={chosen} value={option.id} />
                <span><b>{option.name}</b>, ${option.monthly} a month or ${option.yearly} a year<br /><span class="muted">{option.includes}</span></span>
            </label>
        {/each}
    </fieldset>
    <fieldset class="period">
        <legend>Pay</legend>
        <label><input type="radio" bind:group={yearly} value={false} /> Monthly</label>
        <label><input type="radio" bind:group={yearly} value={true} /> Yearly (2 months free)</label>
    </fieldset>
    <div class="actions">
        <MaterialButton variant="contained" on:click={() => dispatch("checkout", priceId(chosen, yearly))}>Pay ${yearly ? `${plan.yearly} a year` : `${plan.monthly} a month`}</MaterialButton>
    </div>
{/if}

<style>
    p {
        margin: 0 0 8px;
    }
    .muted {
        opacity: 0.7;
    }
    fieldset {
        border: none;
        margin: 0 0 12px;
        padding: 0;
    }
    legend {
        opacity: 0.7;
        margin-bottom: 4px;
    }
    label {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 6px 0;
        cursor: pointer;
    }
    .period {
        display: flex;
        gap: 20px;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
    }
</style>
