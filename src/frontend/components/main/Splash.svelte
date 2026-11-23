<script lang="ts">
    import { onMount } from "svelte"
    import { openLiveCopilot } from "../../ai/liveCopilot"
    import { activePopup, activeProject, ai, popupData, projects, projectView, quickSearchActive, scriptures, shows, showRecentlyUsedProjects, special, version } from "../../stores"
    import { history } from "../helpers/history"
    import Icon from "../helpers/Icon.svelte"
    import T from "../helpers/T.svelte"
    import Link from "../inputs/Link.svelte"
    import MaterialButton from "../inputs/MaterialButton.svelte"
    import Center from "../system/Center.svelte"
    import { getVOTD } from "./votd"

    function createProject() {
        // if opened project is empty go to project list (to reduce confusion)
        if ($projects[$activeProject || ""]?.shows?.length === 0) {
            activeProject.set(null)
            projectView.set(true)
        }

        history({ id: "UPDATE", location: { page: "show", id: "project" } })

        showRecentlyUsedProjects.set(false)
    }

    let links: string[] = []
    function extractLinksAndCleanText(text: string) {
        links = []

        // extract and remove links from <a> tags
        const textWithoutATags = text.replace(/<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>.*?<\/a>/gi, (_match, url) => {
            links.push(url)
            return ""
        })
        // extract and remove raw links from plain text
        const finalText = textWithoutATags.replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
            links.push(url)
            return ""
        })

        return finalText.replaceAll("\n", "<br>").replace(/\s+/g, " ").trim()
    }

    // GET READY: the four things a church does once, each ticked off from what
    // the app already holds; the list steps aside when all are done or hidden
    const HIDE_KEY = "home-get-ready-hidden"
    let hidden = localStorage.getItem(HIDE_KEY) === "1"
    $: steps = [
        { label: "Add your songs", hint: "Import from EasyWorship, ProPresenter and others, or sync your church library", done: Object.keys($shows).length > 0, open: () => activePopup.set("import") },
        {
            label: "Download a Bible",
            hint: "KJV, BSB and more, free and offline",
            done: Object.keys($scriptures).length > 0,
            open: () => {
                popupData.set({ importType: "scriptural" })
                activePopup.set("import_scripture")
            }
        },
        { label: "Plan the service", hint: "A project holds the songs, scripture and media in order", done: Object.values($projects).some((p) => p?.shows?.length), open: createProject },
        { label: "Turn on Live Copilot", hint: "It hears the scripture and songs and offers to put them up", done: !!($ai.enabled && $ai.stt?.micDeviceId), open: openLiveCopilot }
    ]
    $: showSteps = !hidden && steps.some((s) => !s.done)
    function hideSteps() {
        hidden = true
        localStorage.setItem(HIDE_KEY, "1")
    }

    let votd: string = ""
    onMount(async () => {
        if ($special.splashText) return
        votd = await getVOTD()
    })
</script>

<Center class="context #splash">
    <img src="./scriptural-logo.svg" alt="" draggable={false} style="width: 64px;height: 64px;border-radius: 22.27%;box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12);" />
    <h1>Scriptural</h1>
    <p style="opacity: 0.7;">v{$version}</p>
    {#if $special.splashText}
        <p style="padding-top: 30px">
            {@html extractLinksAndCleanText($special.splashText)}
            <span class="links" style="display: flex;flex-direction: column;align-items: center;">
                {#each links as link}
                    <Link url={link}>
                        {link.replace(/^(https?:\/\/)/, "")}
                        <Icon id="launch" white />
                    </Link>
                {/each}
            </span>
        </p>
    {:else if votd}
        <p class="votd" style="padding-top: 30px" data-title="Verse of the Day [votd.org]">
            <Link url="https://votd.org/">
                {votd}
            </Link>
        </p>
    {/if}

    {#if showSteps}
        <div class="ready">
            <h2>Get ready for Sunday</h2>
            {#each steps as step, i}
                <button class="step" class:done={step.done} on:click={step.open}>
                    <span class="mark"
                        >{#if step.done}<Icon id="check" white size={0.9} />{:else}{i + 1}{/if}</span
                    >
                    <span class="words">
                        <span class="label">{step.label}</span>
                        <span class="hint">{step.hint}</span>
                    </span>
                </button>
            {/each}
            <MaterialButton variant="text" small on:click={hideSteps}>Hide these steps</MaterialButton>
        </div>
    {/if}

    <span style="padding-top: 30px" class="buttons">
        <MaterialButton icon="search" title="main.quick_search" on:click={() => quickSearchActive.set(true)}>
            <T id="main.quick_search" />
        </MaterialButton>
        <MaterialButton icon="project" title="tooltip.project" on:click={createProject}>
            <T id="new.project" />
        </MaterialButton>
        <MaterialButton
            icon="add"
            title="tooltip.show"
            on:click={(e) => {
                if (e.detail.ctrl) {
                    history({ id: "UPDATE", newData: { remember: { project: $activeProject } }, location: { page: "show", id: "show" } })
                } else activePopup.set("show")
            }}
        >
            <T id="new.show" />
        </MaterialButton>
    </span>
</Center>

<style>
    h1 {
        font-size: 4em;
        overflow: initial;
    }

    p {
        overflow: initial;
    }

    .ready {
        margin-top: 30px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        width: min(460px, 90%);
        text-align: left;
    }
    .ready h2 {
        font-size: 1.1em;
        margin: 0 0 6px;
    }
    .ready :global(button:last-child) {
        align-self: flex-end;
    }
    .step {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--primary-lighter);
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text);
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    .step:hover {
        background: var(--hover);
    }
    .step.done {
        opacity: 0.55;
    }
    .mark {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--primary-lighter);
        border-radius: 50%;
        font-size: 0.85em;
    }
    .words {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .label {
        font-weight: 600;
    }
    .hint {
        opacity: 0.7;
        font-size: 0.9em;
        white-space: normal;
    }

    .buttons {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .buttons :global(button) {
        justify-content: start;
        padding: 8px 12px;
    }

    .votd {
        padding: 0 10px;
        max-width: 580px;
        white-space: normal;
        text-align: left;
        font-style: italic;
        font-size: 0.9em;
    }
    .votd :global(a) {
        text-decoration: none;
    }

    @media screen and (max-height: 500px) {
        h1 {
            font-size: 3em;
        }
    }
    @media screen and (max-height: 400px) {
        h1 {
            font-size: 2em;
        }
    }
    @media screen and (max-width: 800px) {
        h1 {
            font-size: 2em;
        }
    }
</style>
