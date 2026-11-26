<script lang="ts">
    import { onMount } from "svelte"
    import { getEditItems } from "../../../components/edit/scripts/itemHelpers"
    import Icon from "../../../components/helpers/Icon.svelte"
    import { getLayoutRef } from "../../../components/helpers/show"
    import T from "../../../components/helpers/T.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import Center from "../../../components/system/Center.svelte"
    import { planProblem } from "../../../scriptural/planNotice"
    import { activeEdit, activeShow, ai, dictionary, popupData } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { addChatMessage, chatSessions, getLLMManager } from "../../llm/llmManager"
    import { getSlideChatSystemPrompt } from "../../llm/prompts"
    import { ChatAction, chatActionLabels } from "../../manager/ChatAction"
    import MatthiasExamples from "../MatthiasExamples.svelte"
    import { Matthias, matthiasStatus, matthiasSteps } from "../../voice/matthiasAgent"
    import { tick } from "svelte"
    import AiRing from "./AiRing.svelte"

    export let sessionKey: string = ""

    $: activeSessionKey = sessionKey || $popupData?.sessionKey || getActiveSlideSessionKey($activeEdit, $activeShow)
    $: targetType = ($popupData?.targetType || ($activeEdit?.type === "overlay" ? "overlay" : $activeEdit?.type === "template" ? "template" : "slide")) as "slide" | "overlay" | "template"

    function getActiveSlideSessionKey(editState: any, showState: any): string {
        if (editState?.type === "overlay" && editState.id) {
            return `overlay_${editState.id}`
        }
        if (editState?.type === "template" && editState.id) {
            return `template_${editState.id}`
        }
        if (editState?.slide !== undefined && editState?.slide !== null) {
            const showId = showState?.id || editState.showId || ""
            const ref = getLayoutRef(showId)
            const slideId = ref[editState.slide]?.id || `slide_${editState.slide}`
            return `show_${showId}_slide_${slideId}`
        }
        return "default"
    }

    let chatInput = ""
    let isSending = false

    // the copilot's own chat runs the app; the others design one slide
    $: isAgent = activeSessionKey === "default"
    $: working = isAgent ? $matthiasStatus?.state === "working" : isSending
    $: if (chatMessages.length || working) void tick().then(scrollToBottomChat)
    const stepLabels: { [key: string]: string } = {
        get_live_state: "matthias.step_get_live_state",
        get_transcript: "matthias.step_get_transcript",
        show_found: "matthias.step_show_found",
        set_listening: "matthias.step_set_listening",
        set_agent_mode: "matthias.step_set_agent_mode",
        search_bible: "matthias.step_search_bible",
        read_passage: "matthias.step_read_passage",
        show_scripture: "matthias.step_show_scripture",
        list_songs: "matthias.step_list_songs",
        get_song: "matthias.step_get_song",
        add_song: "matthias.step_add_song",
        present_song: "matthias.step_present_song",
        control_screen: "matthias.step_control_screen",
        open_plan: "matthias.step_open_plan",
        remove_from_plan: "matthias.step_remove_from_plan",
        show_plan_item: "matthias.step_show_plan_item",
        show_section: "matthias.step_show_section",
        set_bible_version: "matthias.step_set_bible_version",
        show_overlay: "matthias.step_show_overlay",
        show_picture_or_video: "matthias.step_show_picture_or_video",
        control_sound: "matthias.step_control_sound",
        open_page: "matthias.step_open_page",
        list_plans: "matthias.step_list_plans",
        create_plan: "matthias.step_create_plan",
        add_to_plan: "matthias.step_add_to_plan",
        speaker_timer: "matthias.step_speaker_timer",
        draw_on_screen: "matthias.step_draw_on_screen",
        clean_up_drawing: "matthias.step_clean_up_drawing",
        clear_drawing: "matthias.step_clear_drawing",
        make_list: "matthias.step_make_list"
    }
    $: chatMessages = $chatSessions[activeSessionKey] || []

    onMount(() => {
        scrollToBottomChat()

        // auto focus input
        setTimeout(() => {
            const chatInputElement = document.querySelector(".chat-input") as HTMLInputElement
            if (chatInputElement) chatInputElement.focus()
        }, 50)
    })

    function scrollToBottomChat() {
        const messagesContainer = document.querySelector(".chat-messages")
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight
        }
    }

    async function sendChatMessage() {
        const inputPrompt = chatInput.trim()
        if (!inputPrompt || isSending) return

        const llm = getLLMManager()
        // what was typed stays in the box until there is something to send it to
        if (!llm) {
            addChatMessage(activeSessionKey, "assistant", translateText("matthias.choose_model_send"))
            return
        }
        chatInput = ""

        isSending = true
        setTimeout(scrollToBottomChat)

        try {
            const res = await llm.sendMessage(activeSessionKey, inputPrompt, { systemPrompt: getSlideChatSystemPrompt(targetType, getEditItems()) })
            if (!res) addChatMessage(activeSessionKey, "assistant", $planProblem || translateText("matthias.no_answer"))
            if (res?.action && res.action.type === "APPLY_TO_SLIDE") {
                ChatAction.handle(res.action)
            }
            setTimeout(scrollToBottomChat)
        } catch (err) {
            console.error("Failed to send message:", err)
            addChatMessage(activeSessionKey, "assistant", translateText("matthias.did_not_work"))
        } finally {
            isSending = false
            setTimeout(scrollToBottomChat)
        }
    }

    function handleChatKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            sendChatMessage()
        }
    }

    // function clearChat() {
    //     clearChatHistory(activeSessionKey)
    // }

    function getActionIcon(actionType: string): string {
        switch (actionType) {
            case "APPLY_TO_SLIDE":
                return "check"
            case "CREATE_TEMPLATE":
                return "template"
            case "CREATE_OVERLAY":
                return "overlay"
            default:
                return "slide"
        }
    }
</script>

<div class="chat-container" class:fill={isAgent}>
    <!-- {#if chatMessages.length > 0}
        <MaterialButton class="popup-reset" icon="delete" title="Clear" on:click={clearChat} white />
    {/if} -->

    {#if isAgent || ($ai?.llm?.provider && $ai?.llm?.provider !== "none")}
        <div class="chat-messages">
            {#if chatMessages.length === 0}
                <Center faded={!isAgent}>
                    <div class="empty-state">
                        {#if !isAgent}<Icon id="ai" size={2.2} gradient />{/if}
                        <p class="placeholder">
                            {#if isAgent}<T id="matthias.type_or_try" />{:else}<T id="chat.ask" />{/if}
                        </p>
                        {#if isAgent}
                            <MatthiasExamples clickable on:ask={(e) => Matthias.ask(e.detail, true, true)} />
                        {/if}
                    </div>
                </Center>
            {:else}
                {#each chatMessages as msg (msg.id)}
                    <div class="chat-message {msg.role}">
                        <p>{msg.content}</p>

                        {#if msg.action}
                            <MaterialButton title="matthias.execute_action" style="margin-top: 10px;padding: 0;border-radius: 50px;" on:click={() => ChatAction.handle(msg.action)}>
                                <AiRing opacity={0.85}>
                                    <div style="display: flex;align-items: center;justify-content: space-between;gap: 8px;padding: 8px 14px;">
                                        <Icon id={getActionIcon(msg.action.type)} size={1.1} white />

                                        <span>{translateText(chatActionLabels[msg.action.type] || "timer.create")}{msg.action.data?.name ? `: ${msg.action.data.name}` : ""}</span>
                                    </div>
                                </AiRing>
                            </MaterialButton>
                        {/if}
                    </div>
                {/each}
                {#if working}
                    <div class="chat-message assistant placeholder">
                        {#each isAgent ? $matthiasSteps : [] as step}
                            <p class:failed={!step.ok}>{step.ok ? translateText(stepLabels[step.tool] || step.tool, $dictionary) : translateText("matthias.step_failed", $dictionary, [translateText(stepLabels[step.tool] || step.tool, $dictionary)])}</p>
                        {/each}
                        <p><T id="ai.processing" /></p>
                    </div>
                {/if}
            {/if}
        </div>
        {#if !isAgent}<div class="chat-input-row">
                <input type="text" class="chat-input" placeholder={translateText("chat.type_message")} bind:value={chatInput} on:keydown={handleChatKeyDown} />
                <MaterialButton icon="send" title="chat.send" on:click={sendChatMessage} disabled={!chatInput.trim() || isSending} />
            </div>{/if}
    {:else}
        <Center faded>
            <p class="placeholder"><T id="matthias.choose_model_chat" /></p>
        </Center>
    {/if}
</div>

<style>
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .placeholder {
        font-size: 0.95rem;
    }

    .chat-container {
        display: flex;
        flex-direction: column;
        height: 480px;
        max-height: calc(75vh - 80px);
        width: 560px;
        max-width: calc(85vw - 40px);
        overflow: hidden;
    }

    .chat-container.fill {
        flex: 1;
        min-height: 0;
        height: auto;
        max-height: none;
        width: 100%;
        max-width: none;
    }
    .failed {
        color: var(--error-text);
    }

    .chat-messages {
        display: flex;
        flex-direction: column;
        flex: 1;
        padding: 12px;
        overflow-y: auto;
    }

    /* no bubbles: what was asked sits to the right, and a hairline parts one message from the next */
    .chat-message {
        max-width: 85%;
        padding: 10px 2px;
        font-size: 0.92rem;
        line-height: 1.45;
        color: var(--text);
    }

    .chat-message + .chat-message {
        border-top: 1px solid var(--border);
    }

    .chat-message p {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;

        user-select: text;
    }

    .chat-message.user {
        align-self: flex-end;
        text-align: right;
        color: var(--muted-text);
    }

    .chat-message.assistant,
    .chat-message.ai {
        align-self: stretch;
        max-width: none;
    }

    .chat-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid var(--border);
    }

    .chat-input {
        flex: 1;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        color: var(--text);
        font-size: 0.92rem;
    }

    .chat-input:focus {
        border-color: var(--secondary);
    }
    .chat-input:focus-visible {
        outline: 2px solid var(--secondary);
        outline-offset: 1px;
    }
</style>
