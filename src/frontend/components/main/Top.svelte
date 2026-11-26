<script lang="ts">
    import { slide } from "svelte/transition"
    import { activeEdit, activePage, activePopup, activeProfile, activeProject, activeShow, ai, cloudUsers, dictionary, drawSettings, drawTool, os, outputDisplay, outputs, paintCache, profiles, saved, settingsTab, shows } from "../../stores"
    import { getCloudUsers } from "../../utils/cloudSync"
    import { translateText } from "../../utils/language"
    import { DEFAULT_DISPLAY_NAME } from "../../utils/SocketHelper"
    import { settingsTabs } from "../../values/tabs"
    import Icon from "../helpers/Icon.svelte"
    import { toggleOutputs } from "../helpers/output"
    import T from "../helpers/T.svelte"
    import Button from "../inputs/Button.svelte"
    import TopButton from "../inputs/TopButton.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"
    import { copilotOpen, copilotState, openLiveCopilot } from "../../ai/liveCopilot"
    import { librarySyncPending, syncChurch, syncStatus } from "../../scriptural/churchSync"
    import { ACTIVE_CHURCH_KEY } from "../../scriptural/ai"
    import { newToast } from "../../utils/common"

    export let isWindows = false

    // the church library syncs only from this button or the library window, never by itself
    async function syncLibrary() {
        const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY)
        if (!churchId) return activePopup.set("church_library")
        try {
            const done = await syncChurch(churchId)
            newToast(done.refused || (done.sent || done.received ? `Library synced: ${done.sent} sent, ${done.received} received.` : "The library is up to date."))
        } catch {
            newToast($syncStatus.error || "The sync stopped. Try again.")
        }
    }

    // room for every button to say what it is
    let innerWidth = 0
    // the panel's width, as MainLayout sets it
    $: room = innerWidth - ($ai.enabled && $copilotOpen ? Math.min(480, Math.max(400, innerWidth * 0.32)) : 0)
    $: wide = room >= 1520

    $: show = $shows[$activeShow?.id || ""]
    $: showProfile = profile?.access.shows || {}
    $: isLocked = show?.locked || showProfile.global === "read" || showProfile[show?.category || ""] === "read"

    // && !$editHistory.length
    $: editDisabled = $activeEdit.id && ($activeEdit.type || "show") !== "show" ? false : $activeShow && ($activeShow?.type || "show") === "show" ? isLocked : $activeShow?.type === "pdf" || !$activeShow?.id
    $: physicalOutputWindows = Object.values($outputs).filter((a) => a.enabled && !a.invisible)

    let confirm = false
    let disableClick = false
    let cancelConfirmTimeout: NodeJS.Timeout | null = null
    function toggleOutput(e: any) {
        if (cancelConfirmTimeout) clearTimeout(cancelConfirmTimeout)

        const forceKey = e.ctrlKey || e.metaKey

        if (!$outputDisplay || confirm) {
            if (confirm) {
                // prevent displaying just after close
                disableClick = true
                setTimeout(() => (disableClick = false), 800)
            }

            confirm = false
            toggleOutputs(null, { force: forceKey })
            return
        }

        if (forceKey) return

        confirm = true
        cancelConfirmTimeout = setTimeout(() => {
            confirm = false
        }, 1800)
    }

    function openOutputSettings() {
        settingsTab.set("display_settings")
        activePage.set("settings")
    }

    // disabled tabs

    let settingsDisabled = false
    $: profile = $profiles[$activeProfile || ""]
    $: settingsDisabled = Object.keys(profile?.access.settings || {}).length >= settingsTabs.length

    $: noPhysicalOutputWindows = (!$outputDisplay && !physicalOutputWindows.length) || disableClick

    $: users = getCloudUsers($cloudUsers)
    function goToUser(user: { [key: string]: any }) {
        if (user.activePage) activePage.set(user.activePage as any)
        if (user.activeProject) activeProject.set(user.activeProject)
        if (user.activeShow) {
            activeShow.set(user.activeShow)

            if (user.activeShow.type === "image" || user.activeShow.type === "video") activeEdit.set({ id: user.activeShow.id, type: "media", items: [] })
            else activeEdit.set({ type: "show", slide: 0, items: [], showId: user.activeShow.id })
        }
    }
</script>

<svelte:window bind:innerWidth />

{#if users.length}
    <div class="users" style="{isWindows ? 'top: 25px;' : ''}width: calc(17px + ((22px - 5px) * {users.length}));" data-title={translateText("settings.connections")}>
        {#each users as user, i}
            {@const isSameArea = $activeShow && user.activeShow?.id === $activeShow?.id}
            {@const name = user.displayName || DEFAULT_DISPLAY_NAME}

            <div class="user" class:isSameArea data-title={name} style="background-color: {user.color};transform: translateX(-{5 * i}px);" role="none" on:click={() => goToUser(user)}>
                {#if name === DEFAULT_DISPLAY_NAME}
                    <Icon id="profiles" size={1.2} white />
                {:else}
                    {name.charAt(0)}
                {/if}
            </div>
        {/each}
    </div>
{/if}

<div class="top" class:drag={!isWindows}>
    <!-- {#if !isWindows}
    <div class="dragZone" />
    {/if} -->
    <span class="side">
        {#if !$saved && $os.platform !== "win32"}
            <div class="unsaved" />
        {/if}
        <!-- logo -->
        <h1 class="brand">
            <img class="brand-mark" src="./scriptural-logo.svg" alt="" draggable={false} />
            Scriptural
        </h1>
    </span>
    <span>
        <TopButton id="show" />
        <TopButton id="edit" disabled={editDisabled} />
        <TopButton id="stage" />
    </span>
    <span class="side" style="justify-content: flex-end;">
        <MaterialButton style="border-radius: 0;border-bottom: 2px solid var(--primary);padding: 0.3em 1.2em;" title="{translateText('settings.ai', $dictionary)} [Ctrl+J]" isActive={$ai.enabled && $copilotOpen} on:click={openLiveCopilot}>
            <Icon id="ai" size={1.5} white />
            {#if $ai.enabled && $copilotState !== "inactive"}<span class="state {$copilotState}" role="img" aria-label={$copilotState === "error" ? "Microphone problem" : $copilotState === "listening" ? "Listening" : "Getting ready"}></span>{/if}
            <span class="copilot-label"
                >{#if $ai.enabled && $ai.matthias?.agentMode}Agent mode on{:else}<T id="settings.ai" />{/if}</span
            >
        </MaterialButton>
        <TopButton id="draw" red={$drawTool === "fill" || ($drawTool === "zoom" && $drawSettings.zoom?.size !== 100) || !!($drawTool === "paint" && $paintCache?.length)} hideLabel={!wide} />
        {#if $librarySyncPending}
            <MaterialButton style="border-radius: 0;border-bottom: 2px solid var(--primary);padding: 0.3em 1em;" title="Send your song changes to the church library" disabled={$syncStatus.running} on:click={syncLibrary}>
                <Icon id="refresh" size={1.3} white />
                <span>{$syncStatus.running ? "Syncing" : "Sync library"}</span>
            </MaterialButton>
        {/if}
        <MaterialButton style="border-radius: 0;border-bottom: 2px solid var(--primary);padding: 0.3em 1em;" title="Account" on:click={() => activePopup.set("church_library")}>
            <Icon id="profiles" size={1.4} white />
            {#if wide}<span>Account</span>{/if}
        </MaterialButton>
        {#if !settingsDisabled}
            <TopButton id="settings" hideLabel={!wide} />
        {/if}

        <!-- <MaterialButton id="output_window_button" class="context #output display {$outputDisplay ? 'on' : 'off'}" title="menu.{$outputDisplay ? (confirm ? 'again_confirm' : '_title_display_stop') : '_title_display'} [Ctrl+O]" style={$outputDisplay || disableClick ? "" : "border-bottom: 2px solid var(--secondary);"} on:click={toggleOutput} disabled={(!$outputDisplay && !physicalOutputWindows.length) || disableClick} red={$outputDisplay}>
            {#if $outputDisplay}
                {#if confirm}
                    <Icon id="close" size={1.6} white />
                {:else}
                    <Icon id="cancelDisplay" size={1.6} white />
                {/if}
            {:else}
                <Icon id="outputs" size={1.6} white />
            {/if}

            {#if $outputDisplay && confirm}
                <div class="click_again" transition:slide>
                    <T id="menu.again_confirm" />
                </div>
            {/if}
        </MaterialButton> -->
        <Button id="output_window_button" title={translateText(`menu.${$outputDisplay ? (confirm ? "again_confirm" : "_title_display_stop") : "_title_display"} [Ctrl+O]`, $dictionary)} style={$outputDisplay || disableClick ? "" : "border-bottom: 2px solid var(--secondary);"} on:click={toggleOutput} class="context #output display {$outputDisplay ? 'on' : 'off'}" red={$outputDisplay} disabled={noPhysicalOutputWindows}>
            {#if $outputDisplay}
                {#if confirm}
                    <Icon id="close" size={1.6} white />
                {:else}
                    <Icon id="cancelDisplay" size={1.6} white />
                {/if}
            {:else}
                <Icon id="outputs" size={1.6} white />
            {/if}
            {#if room >= 1200 && !confirm}<span class="present">{$outputDisplay ? "Stop" : "Present"}</span>{/if}

            {#if $outputDisplay && confirm}
                <div class="click_again" transition:slide>
                    <T id="menu.again_confirm" />
                </div>
            {/if}
        </Button>
        {#if !$outputDisplay && !physicalOutputWindows.length}
            <div data-title={translateText("No 'physical' outputs available!")} style="position: absolute;top: 0;inset-inline-end: 0;height: 100%;width: 60px;" role="none" on:click={openOutputSettings} />
        {/if}
    </span>
</div>

<style>
    @media screen and (max-width: 750px) {
        .copilot-label {
            display: none;
        }
    }

    .state {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--muted-text);
    }
    .state.listening {
        background-color: var(--connected);
    }
    .state.error {
        background-color: var(--disconnected);
    }
    .top .present {
        margin-inline-start: 8px;
    }

    .top {
        position: relative;
        display: flex;
        justify-content: space-between;
        z-index: 30;
        min-height: 40px;
        height: 40px;

        box-shadow: 0 0 4px rgb(0 0 0 / 0.4);

        /* disabled because it's causing unexpected behaviour in Windows 11 */
        /* -webkit-app-region: drag; */
    }
    .top span {
        display: flex;
    }

    /* equal sides that grow with their buttons, so the middle stays centered and nothing is cut off */
    .top .side {
        flex: 1;
        min-width: max-content;
    }
    .top .side:first-child .brand {
        width: var(--navigation-width);
        justify-content: center;
    }

    .top.drag {
        -webkit-app-region: drag;
    }

    .top.drag :global(button) {
        -webkit-app-region: no-drag;
    }

    /* .dragZone {
        position: absolute;

        display: flex;
        justify-content: space-between;
        background-color: var(--primary-darker);
        width: 100%;
        height: 3px;

        z-index: 2;
        -webkit-app-region: drag;
    } */

    div :global(button.display) {
        display: flex;
        justify-content: center;
        min-width: 60px;
    }

    .unsaved {
        position: absolute;
        left: 0;
        height: 100%;
        width: 5px;
        background-color: var(--red);
    }

    @media screen and (max-width: 580px) {
        .top span:first-child {
            display: none;
        }
    }

    .click_again {
        position: absolute;
        bottom: 0;
        inset-inline-end: 0;
        transform: translateY(100%);

        font-size: 1.1em;
        padding: 4px 10px;
        font-weight: normal;
        background-color: var(--primary-darker);
        color: var(--text);

        border: 2px solid var(--secondary);
        border-top: none;
        border-inline-end: none;
    }

    /* USERS */

    .users {
        position: absolute;
        top: 0;
        left: 0;
        height: calc(40px - 4px);

        display: flex;
        align-items: center;
        /* gap: 2px; */
        margin: 2px 0;
        padding: 0 5px;

        background-color: var(--primary-darker);
        border: 1px solid var(--primary-lighter);
        border-left: none;
        border-top-right-radius: 5px;
        border-bottom-right-radius: 5px;

        z-index: 31;
    }

    .user {
        width: 22px;
        min-width: 22px;
        height: 22px;

        background-color: var(--secondary);
        color: var(--textInvert);
        border: 1px solid var(--primary-lighter);
        border-radius: 50%;

        font-size: 0.8em;
        font-weight: bold;

        display: flex;
        align-items: center;
        justify-content: center;
    }
    .user:hover {
        filter: brightness(0.9);
    }
    .user.isSameArea {
        box-shadow: 0 0 0 2px var(--secondary);
    }

    /* the Scriptural mark beside the name, as in the Scriptural app's header */
    .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 0 10px;
        font-size: 1.25em;
        font-weight: 600;
    }
    .brand-mark {
        width: 24px;
        height: 24px;
        border-radius: 22.27%;
        box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12);
    }
</style>
