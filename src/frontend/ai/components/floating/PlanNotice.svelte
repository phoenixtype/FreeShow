<script lang="ts">
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import T from "../../../components/helpers/T.svelte"
    import { planNotice } from "../../../scriptural/planNotice"
    import { activePopup } from "../../../stores"
</script>

{#if $planNotice}
    <div class="notice" role="status">
        <p>{$planNotice}</p>
        <div class="actions">
            <MaterialButton variant="text" small on:click={() => planNotice.set("")}><T id="matthias.close" /></MaterialButton>
            <MaterialButton variant="outlined" small on:click={() => activePopup.set("church_library")}><T id="matthias.see_plans" /></MaterialButton>
        </div>
    </div>
{/if}

<style>
    .notice {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 12px;
    }
    p {
        white-space: initial;
        line-height: 1.3;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
</style>
