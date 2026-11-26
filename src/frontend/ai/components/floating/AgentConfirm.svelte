<!-- asked once each time the app runs, before Matthias may lead the screen -->
<script lang="ts">
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { cancelAgentMode, confirmAgentMode } from "../../agent/control"
    import T from "../../../components/helpers/T.svelte"
    import { dictionary } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { NAME } from "../../voice/matthias"
</script>

<div class="confirm" role="alertdialog" aria-label={translateText("matthias.let_lead", $dictionary, [NAME])}>
    <p><T id="matthias.agent_warning" replace={[NAME]} /></p>
    <div class="actions">
        <MaterialButton variant="text" small on:click={cancelAgentMode}><T id="matthias.cancel" /></MaterialButton>
        <MaterialButton variant="outlined" small on:click={confirmAgentMode}><T id="matthias.turn_on" /></MaterialButton>
    </div>
</div>

<style>
    .confirm {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
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
