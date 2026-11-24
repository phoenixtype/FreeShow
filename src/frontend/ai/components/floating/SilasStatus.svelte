<script lang="ts">
    import Icon from "../../../components/helpers/Icon.svelte"
    import { NAME } from "../../voice/silas"
    import { silasStatus } from "../../voice/silasAgent"

    const icons = { hearing: "microphone", working: "ai", done: "check", failed: "close" }
</script>

{#if $silasStatus}
    <div class="silas {$silasStatus.state}" role="status">
        <Icon id={icons[$silasStatus.state]} white />
        <b>{NAME}</b>
        <span>{$silasStatus.text}</span>
    </div>
{/if}

<style>
    .silas {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        max-width: 100%;
        background-color: var(--primary-darkest);
    }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .hearing span,
    .working span {
        opacity: 0.7;
    }
    .failed span {
        color: #ff9d9d;
    }
</style>
