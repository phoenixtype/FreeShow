<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { fly } from "svelte/transition"
    import Icon from "../../../components/helpers/Icon.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import Tabs from "../../../components/main/Tabs.svelte"
    import { activePage, activeTriggerFunction, ai, aiSmartAction, aiSttStatus, focusMode, language, mediaDownloads, resized, settingsTab, sttTempDisabled } from "../../../stores"
    import { resolveSttEngine, SpeechToText } from "../../stt/stt"
    import { copilotListening, copilotOpen, copilotState, type CopilotState } from "../../liveCopilot"
    import { AiManager } from "../../manager/AiManager"
    import AiChat from "./AiChat.svelte"
    import AiTranscription from "./AiTranscription.svelte"
    import MatthiasStatus from "./MatthiasStatus.svelte"
    import { NAME } from "../../voice/matthias"
    import { matthiasStatus } from "../../voice/matthiasAgent"
    import CopilotPreview from "./CopilotPreview.svelte"
    import MatthiasInput from "./MatthiasInput.svelte"
    import ScreenControl from "./ScreenControl.svelte"
    import SmartAction from "./SmartAction.svelte"

    let state: CopilotState = "loading"
    $: copilotState.set(state)

    // Active tab state
    let activeTab: "transcription" | "chat" = "transcription"
    const tabs = {
        transcription: { name: "Heard", icon: "microphone" },
        chat: { name: "Requests", icon: "chat" }
    }

    // moves made by hand are seen from the start, so it never takes the screen from someone using it
    onMount(() => AiManager.listenToOutput())

    $: isOpen = $copilotOpen
    function toggleExpand() {
        // close any visible actions
        aiSmartAction.set(null)

        setTimeout(() => copilotOpen.update((open) => !open))

        if (!$sttTempDisabled) enableListening()
    }

    // try to enable every time a download finishes
    let downloadingCount = 0
    $: currentlyDownloading = $mediaDownloads
    $: if (state !== "listening" && currentlyDownloading) {
        if (currentlyDownloading.size < downloadingCount && !$sttTempDisabled) enableListening()
        downloadingCount = currentlyDownloading.size
    }

    // STATE & SYNCHRONIZATION
    $: isEnabled = $ai.enabled
    $: micDeviceId = $ai.stt?.micDeviceId

    let lastMic = ""
    let lastEngine = ""

    $: engineId = resolveEngineId($ai.stt?.engine, $language)
    function resolveEngineId(explicit: string | undefined, _locale: string): string {
        return explicit || resolveSttEngine()
    }

    let sessionToken = 0
    $: syncSession(isEnabled, micDeviceId, engineId)
    async function syncSession(enabled: boolean | undefined, mic: string | undefined, engine: string) {
        const currentLock = ++sessionToken
        // only once the operator has asked to listen (sttTempDisabled starts true each launch)
        const shouldBeActive = Boolean(enabled && mic && !$sttTempDisabled)
        const micChanged = (mic || "") !== lastMic
        const engineChanged = engine !== lastEngine

        if (shouldBeActive) {
            const isCurrentlyActive = state === "listening" || state === "processing" || state === "loading"
            if (isCurrentlyActive && !micChanged && !engineChanged) return

            const wasInactive = state === "inactive"
            state = "loading"

            lastMic = mic || ""
            lastEngine = engine

            if (wasInactive) {
                const result = await SpeechToText.enable()
                if (currentLock !== sessionToken || result.aborted) return
                state = result.ok ? "listening" : "error"
            } else {
                const capture = micChanged ? await SpeechToText.restartCapture() : { ok: true }
                if (currentLock !== sessionToken || capture.aborted) return

                const engineResult = engineChanged ? await SpeechToText.restartEngine() : { ok: true }
                if (currentLock !== sessionToken || engineResult.aborted) return

                if (!capture.ok || !engineResult.ok) state = "error"
                else state = "listening"
            }
            return
        }

        lastMic = mic || ""
        lastEngine = engine

        if (state !== "inactive") {
            SpeechToText.disable()
            if (currentLock === sessionToken) {
                state = "inactive"
            }
        }
    }

    $: if (state === "listening" && $aiSttStatus.state === "error") {
        state = "error"
        SpeechToText.stopCapture()
    }

    onDestroy(() => {
        copilotListening.set(false)
        copilotState.set("inactive")
        copilotOpen.set(false)
        if (retryTimer) clearTimeout(retryTimer)
        if (state !== "inactive") SpeechToText.disable()
    })

    // leading by itself, it also gets its own microphone back
    const RETRY_MS = [5000, 15_000, 30_000, 60_000]
    let retries = 0
    let retryTimer: NodeJS.Timeout | null = null
    $: if (state === "listening") retries = 0
    $: if (state === "error" && $ai.matthias?.agentMode && !$sttTempDisabled && !retryTimer) {
        retryTimer = setTimeout(
            () => {
                retryTimer = null
                retries++
                if (state === "error" && $ai.matthias?.agentMode && !$sttTempDisabled) void enableListening()
            },
            RETRY_MS[Math.min(retries, RETRY_MS.length - 1)]
        )
    }

    // LISTEN TOGGLE
    $: if ($activeTriggerFunction.startsWith("toggle_stt_listening:")) {
        const action = $activeTriggerFunction.split(":")[1]
        if (action === "on") toggleListening(true)
        else if (action === "off") toggleListening(false)
        else toggleListening()
    }

    function toggleListening(enable?: boolean) {
        const turnOn = enable === undefined ? !isListening : enable
        if (turnOn) {
            if (isListening) return
            sttTempDisabled.set(false)
            enableListening()
        } else {
            if (!isListening && state === "inactive") return
            sttTempDisabled.set(true)
            SpeechToText.stopCapture()
            state = "inactive"
        }
    }

    $: isListening = state === "listening"
    $: copilotListening.set(isListening)
    $: isStarting = state === "processing"

    async function enableListening() {
        if (isStarting || !isEnabled || !micDeviceId) return
        if (isListening) return

        const result = await SpeechToText.enable()
        if (result.aborted) return
        if (isEnabled && micDeviceId) state = result.ok ? "listening" : "error"
    }

    // the app's own preview stays in view beside the panel; without it, the panel brings one
    let innerWidth = 1440
    $: needsPreview = $focusMode || innerWidth < 1180 || $resized.rightPanel < 100

    // Escape in the panel leaves its box and nothing else. Anywhere else it clears the screen, as always.
    let panel: HTMLElement | undefined
    function onKeydown(e: KeyboardEvent) {
        if (!isOpen || e.key !== "Escape" || !panel?.contains(document.activeElement)) return
        e.preventDefault()
        e.stopImmediatePropagation()
        ;(document.activeElement as HTMLElement)?.blur()
    }

    function openSettings() {
        settingsTab.set("ai")
        activePage.set("settings")
    }
</script>

<svelte:window bind:innerWidth on:keydown|capture={onKeydown} />

{#if !isOpen}
    <SmartAction listening={isListening} />
{:else}
    <!-- beside the app, not over it: everything stays usable while it works -->
    <aside class="panel" bind:this={panel} aria-label={NAME} transition:fly={{ x: 60, duration: 160 }}>
        <header>
            <Icon id="ai" size={1.2} white />
            <h2>{NAME}</h2>
            <span class="listening">{isListening ? "Listening" : state === "error" ? ($ai.matthias?.agentMode ? "Microphone problem, trying again" : "Microphone problem") : "Not listening"}</span>
            <MaterialToggleSwitch label="" title="Listen" checked={isListening} disabled={state !== "inactive" && state !== "listening"} on:change={() => toggleListening()} small />
            <MaterialButton icon="settings" title="menu.settings" style="padding: 10px;" on:click={openSettings} />
            <MaterialButton icon="close" title="actions.close" style="padding: 10px;" on:click={toggleExpand} />
        </header>

        <ScreenControl listening={isListening} />
        {#if needsPreview}<CopilotPreview />{/if}

        <div class="tabs"><Tabs {tabs} bind:active={activeTab} /></div>
        {#if activeTab === "transcription" || $matthiasStatus?.state === "hearing"}<MatthiasStatus />{/if}
        {#if activeTab === "transcription"}
            <AiTranscription {state} on:listen={() => toggleListening(true)} />
        {:else}
            <AiChat sessionKey="default" />
        {/if}

        <MatthiasInput on:sent={() => (activeTab = "chat")} />
    </aside>
{/if}

<style>
    /* MainLayout makes room for it (--copilot-width), except in a narrow window */
    .panel {
        position: fixed;
        inset-block: 0;
        inset-inline-end: 0;
        width: var(--copilot-width);
        max-width: 100vw;
        z-index: 4000;
        display: flex;
        flex-direction: column;
        background-color: var(--primary-darker);
        border-inline-start: 1px solid var(--primary-lighter);
    }

    header {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 40px;
        padding-inline: 12px 4px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    h2 {
        flex: 1;
        margin-inline-start: 4px;
        font-size: 1.05em;
        font-weight: 600;
    }
    .listening {
        font-size: 0.85em;
        color: var(--muted-text);
        margin-inline-end: 4px;
    }

    .tabs {
        border-block: 1px solid var(--primary-lighter);
    }
    .tabs :global(.tabs) {
        background-color: transparent;
    }
</style>
