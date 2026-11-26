<script lang="ts">
    // asked in place, under what was pressed: opening a second window would close this one
    import { createEventDispatcher } from "svelte"
    import MaterialButton from "../../../inputs/MaterialButton.svelte"

    export let question: string
    export let action: string
    export let disabled = false
    export let red = false

    const dispatch = createEventDispatcher()
</script>

<div class="confirm" role="alertdialog" aria-label={question}>
    <p>{question}</p>
    <slot />
    <div class="actions">
        <MaterialButton variant="text" small on:click={() => dispatch("cancel")}>Cancel</MaterialButton>
        <MaterialButton variant="outlined" small {red} {disabled} on:click={() => dispatch("confirm")}>{action}</MaterialButton>
    </div>
</div>

<style>
    .confirm {
        padding: 8px 0;
        border-bottom: 1px solid var(--primary-lighter);
    }
    p {
        margin: 0 0 8px;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
</style>
