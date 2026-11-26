<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte"
    import { fly } from "svelte/transition"
    import { Main } from "../../../../types/IPC/Main"
    import { sendMain } from "../../../IPC/main"
    import Icon from "../../../components/helpers/Icon.svelte"
    import MaterialButton from "../../../components/inputs/MaterialButton.svelte"
    import MaterialToggleSwitch from "../../../components/inputs/MaterialToggleSwitch.svelte"
    import Tabs from "../../../components/main/Tabs.svelte"
    import { activePage, activePopup, activeTriggerFunction, ai, aiSmartAction, aiSttStatus, focusMode, language, mediaDownloads, popupData, resized, settingsTab, sttTempDisabled } from "../../../stores"
    import { classifyListenError, listenNotice, type ListenProblem, shouldRetryListening } from "../../stt/listenStatus"
    import { audioLevelStore, listenProblem, micSilent, resolveSttEngine, SpeechToText } from "../../stt/stt"
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
    import PlanNotice from "./PlanNotice.svelte"
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

                if (!capture.ok || !engineResult.ok) {
                    const reason = "error" in capture ? capture.error : "error" in engineResult ? engineResult.error : ""
                    listenProblem.set(classifyListenError(reason))
                    state = "error"
                } else state = "listening"
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

    // what is wrong, in words, with the one thing to do about it
    let problem: ListenProblem | "" = ""
    $: problem = state === "error" ? $listenProblem || classifyListenError($aiSttStatus.message) : state === "listening" ? $listenProblem : ""

    function fixProblem(what: ListenProblem) {
        if (what === "model") {
            popupData.set({ mode: "setup" })
            activePopup.set("ai_model_manager")
            return
        }
        if (what === "permission") sendMain(Main.ACCESS_MICROPHONE_PERMISSION)
        toggleListening(true)
    }

    // it gets its own microphone back whenever listening was on and nobody stopped it
    const RETRY_MS = [5000, 15_000, 30_000, 60_000]
    let retries = 0
    let retryTimer: NodeJS.Timeout | null = null
    $: if (state === "listening") retries = 0
    $: if (shouldRetryListening({ state, asked: !$sttTempDisabled, problem }) && !retryTimer) {
        retryTimer = setTimeout(retryListening, RETRY_MS[Math.min(retries, RETRY_MS.length - 1)])
    }
    function retryListening() {
        retryTimer = null
        retries++
        if (!shouldRetryListening({ state, asked: !$sttTempDisabled, problem })) return
        // "loading" holds the next retry until this one has answered: starting the engine can take a while
        state = "loading"
        void enableListening()
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
            // disable, not just stop the capture: it also ends any attempt to get the microphone back
            SpeechToText.disable()
            listenProblem.set("")
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

    // opening moves the focus into the panel, closing gives it back
    let opener: HTMLElement | null = null
    let wasOpen = false
    $: moveFocus(isOpen)
    async function moveFocus(open: boolean) {
        if (open === wasOpen) return
        wasOpen = open
        if (open) {
            opener = document.activeElement as HTMLElement | null
            await tick()
            panel?.focus({ preventScroll: true })
            return
        }
        const active = document.activeElement
        if ((active === document.body || panel?.contains(active)) && opener?.isConnected) opener.focus({ preventScroll: true })
    }

    // Escape in the panel leaves its box and nothing else. Anywhere else it clears the screen, as always.
    let panel: HTMLElement | undefined
    function onKeydown(e: KeyboardEvent) {
        // the panel itself holding the focus is not "in its box": Escape clears the screen as usual
        if (!isOpen || e.key !== "Escape" || document.activeElement === panel || !panel?.contains(document.activeElement)) return
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
    <aside class="panel" tabindex="-1" bind:this={panel} aria-label={NAME} transition:fly={{ x: 60, duration: 160 }}>
        <header>
            <Icon id="ai" size={1.2} white />
            <h2>{NAME}</h2>
            <span class="listening" role="status">{isListening ? "Listening" : state === "loading" && !$sttTempDisabled ? "Starting" : "Not listening"}</span>
            {#if isListening}
                <span class="level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round($audioLevelStore * 100)}><span style="width: {Math.round($audioLevelStore * 100)}%"></span></span>
            {/if}
            <MaterialToggleSwitch label="" title="Listen" checked={isListening || (state === "error" && !$sttTempDisabled)} disabled={state === "loading" || state === "processing"} on:change={(e) => toggleListening(e.detail)} small />
            <MaterialButton icon="settings" title="menu.settings" style="padding: 10px;" on:click={openSettings} />
            <MaterialButton icon="close" title="actions.close" style="padding: 10px;" on:click={toggleExpand} />
        </header>

        {#if problem}
            <div class="notice" role="alert">
                <span>{listenNotice(problem).message}</span>
                <MaterialButton variant="outlined" on:click={() => problem && fixProblem(problem)}>{listenNotice(problem).action}</MaterialButton>
            </div>
        {:else if isListening && $micSilent}
            <p class="notice" role="status">Listening, but no sound is coming in. Check the microphone.</p>
        {/if}

        <ScreenControl listening={isListening} />
        <PlanNotice />
        {#if needsPreview}<CopilotPreview />{/if}

        <div class="tabs"><Tabs {tabs} bind:active={activeTab} /></div>
        {#if activeTab === "transcription" || $matthiasStatus?.state === "hearing"}<MatthiasStatus />{/if}
        {#if activeTab === "transcription"}
            <!-- the notice above says what went wrong and what to do; the transcript stays in view -->
            <AiTranscription state={state === "error" ? "inactive" : state} on:listen={() => toggleListening(true)} />
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

    .level {
        width: 36px;
        height: 4px;
        margin-inline-end: 6px;
        border-radius: 2px;
        overflow: hidden;
        background-color: var(--primary-lighter);
    }
    .level span {
        display: block;
        height: 100%;
        background-color: var(--secondary);
    }

    .notice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--primary-lighter);
    }

    .tabs {
        border-block: 1px solid var(--primary-lighter);
    }
    .tabs :global(.tabs) {
        background-color: transparent;
    }
</style>
