<script lang="ts">
    // pick a plan, then how often to pay, then one button
    import { createEventDispatcher } from "svelte"
    import { PLAN_NAMES, PLANS, priceId, type PaidPlan, type PlanState } from "../../../../scriptural/churchAccount"
    import { dictionary } from "../../../../stores"
    import { translateText } from "../../../../utils/language"
    import T from "../../../helpers/T.svelte"
    import MaterialButton from "../../../inputs/MaterialButton.svelte"

    export let state: PlanState
    /** owners and admins: billing-checkout refuses anyone else */
    export let canPay: boolean

    const dispatch = createEventDispatcher<{ checkout: string; portal: null }>()

    let chosen: PaidPlan = "church"
    let yearly = false
    $: plan = PLANS.find((p) => p.id === chosen)!
</script>

<p>{translateText("account.on_plan", $dictionary, [PLAN_NAMES[state.plan] || state.plan])}{state.comped ? ` ${translateText("account.comped", $dictionary)}` : ""}</p>

{#if !canPay}
    <p class="muted"><T id="account.ask_to_change_plan" /></p>
{:else if state.canManageBilling}
    <p class="muted"><T id="account.billing_page_note" /></p>
    <div class="actions">
        <MaterialButton variant="outlined" small on:click={() => dispatch("portal")}><T id="account.manage_billing" /></MaterialButton>
    </div>
{:else if state.plan === "free"}
    <fieldset>
        <legend><T id="account.view_plan" /></legend>
        {#each PLANS as option (option.id)}
            <label>
                <input type="radio" bind:group={chosen} value={option.id} />
                <span><b>{option.name}</b><T id="account.plan_prices" replace={[String(option.monthly), String(option.yearly)]} /><br /><span class="muted">{option.includes}</span></span>
            </label>
        {/each}
    </fieldset>
    <fieldset class="period">
        <legend><T id="account.pay" /></legend>
        <label><input type="radio" bind:group={yearly} value={false} /> <T id="account.monthly" /></label>
        <label><input type="radio" bind:group={yearly} value={true} /> <T id="account.yearly" /></label>
    </fieldset>
    <div class="actions">
        <MaterialButton variant="contained" on:click={() => dispatch("checkout", priceId(chosen, yearly))}>{yearly ? translateText("account.pay_yearly", $dictionary, [String(plan.yearly)]) : translateText("account.pay_monthly", $dictionary, [String(plan.monthly)])}</MaterialButton>
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
