<script lang="ts">
    import Icon from "../../components/helpers/Icon.svelte"
    import { createEventDispatcher } from "svelte"

    // with "try" a click does it; without, they are only to read
    export let clickable = false

    const dispatch = createEventDispatcher<{ ask: string }>()

    const groups = [
        { icon: "scripture", name: "Scripture", say: ["John three sixteen", "Next verse", "Read that in the NLT"] },
        { icon: "search", name: "Find", say: ["Find the verse about being anxious", "Another one"] },
        { icon: "song", name: "Songs", say: ["Sing Amazing Grace", "Back to the chorus", "Find the song that says how sweet the sound"] },
        { icon: "project", name: "Service", say: ["Start the service", "Next item", "What's next?"] },
        { icon: "paint", name: "Draw", say: ["Draw what the preacher is describing", "Draw a cross", "Clean up the drawing", "Clear the drawing"] },
        { icon: "list", name: "Lists", say: ["List the main points", "Make a list from this message"] },
        { icon: "slide", name: "Screen", say: ["Clear the screen", "Bring it back", "Take over", "Stand down"] }
    ]
</script>

<dl>
    {#each groups as group}
        <div class="group">
            <dt><Icon id={group.icon} size={0.9} white />{group.name}</dt>
            <dd>
                {#each group.say as words}
                    {#if clickable}
                        <button class="pill" on:click={() => dispatch("ask", words)}>{words}</button>
                    {:else}
                        <span class="pill">{words}</span>
                    {/if}
                {/each}
            </dd>
        </div>
    {/each}
</dl>

<style>
    dl {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 10px 0 14px;
    }
    .group {
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 8px;
        align-items: start;
    }
    dt {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 5px;
        font-size: 0.9em;
        color: var(--muted-text);
    }
    dd {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0;
    }
    .pill {
        padding: 5px 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background-color: var(--hover);
        color: var(--text);
        font: inherit;
        font-size: 0.9em;
        line-height: 1.35;
        white-space: normal;
        text-align: start;
    }
    button.pill {
        cursor: pointer;
    }
    button.pill:hover,
    button.pill:focus-visible {
        background-color: var(--focus);
    }
</style>
