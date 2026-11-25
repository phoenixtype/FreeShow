<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import { NAME } from "../../voice/matthias"
    import { chatSessions } from "../../llm/llmManager"
    import { Matthias, MATTHIAS_CHAT, matthiasStatus } from "../../voice/matthiasAgent"
    import { focusMatthias } from "../../liveCopilot"

    const dispatch = createEventDispatcher<{ sent: void }>()

    let words = ""
    let input: HTMLInputElement | undefined
    $: hasChat = ($chatSessions[MATTHIAS_CHAT] || []).length > 0
    $: working = $matthiasStatus?.state === "working"
    $: if ($focusMatthias && input) {
        input.focus()
        focusMatthias.set(false)
    }

    function send() {
        const asked = words.trim()
        if (!asked) return
        words = ""
        dispatch("sent")
        void Matthias.ask(asked, true, true)
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key !== "Enter" || e.isComposing) return
        e.preventDefault()
        send()
    }
</script>

<div class="ask">
    <input type="text" bind:this={input} bind:value={words} on:keydown={onKeydown} placeholder="Tell {NAME} what to do" aria-label="Tell {NAME} what to do" />
    {#if working}
        <MaterialButton variant="outlined" small title="Stop what is being done" on:click={() => Matthias.stop()}>Stop</MaterialButton>
    {/if}
    {#if hasChat && !working}
        <MaterialButton variant="outlined" small title="Clear the conversation" on:click={() => Matthias.clearChat()}>Clear chat</MaterialButton>
    {/if}
    <MaterialButton icon="send" title="chat.send" disabled={!words.trim()} on:click={send} />
</div>

<style>
    .ask {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
        border-top: 1px solid var(--primary-lighter);
    }
    input {
        flex: 1;
        min-width: 0;
        background: var(--hover);
        border: 1px solid var(--primary-lighter);
        border-radius: var(--radius-sm);
        padding: 9px 12px;
        color: var(--text);
        font-family: inherit;
        font-size: 0.95rem;
    }
    input:focus {
        outline: none;
        border-color: var(--secondary);
    }
</style>
