<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import { churchPeople, openInvites, removeMember, revokeInvite, ROLE_NAMES, rolesICanGive, setMemberRole, type Invite, type Person, type Role } from "../../../../scriptural/churchAccount"
    import { createInvite, type Church } from "../../../../scriptural/churchSync"
    import { ScripturalError } from "../../../../scriptural/connection"
    import MaterialButton from "../../../inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../../inputs/MaterialDropdown.svelte"
    import ConfirmRow from "./ConfirmRow.svelte"

    export let church: Church
    export let maxMembers: number | null = null
    /** nothing is on a screen, so an upgrade line may show */
    export let canPrompt = true

    const dispatch = createEventDispatcher<{ plans: null; left: null }>()

    let people: Person[] = []
    let invites: Invite[] = []
    let loaded = false
    let message = ""
    let busy = false

    $: manages = church.role === "owner" || church.role === "admin"
    $: grantable = rolesICanGive(church.role)
    $: full = !!maxMembers && people.length >= maxMembers
    let inviteRole: Role = "editor"

    async function load() {
        try {
            people = await churchPeople(church.id)
            invites = church.role === "owner" || church.role === "admin" ? await openInvites(church.id) : []
            loaded = true
        } catch (err) {
            fail(err, "The list of people could not be loaded. Try again.")
        }
    }
    onMount(load)

    function fail(err: unknown, fallback: string) {
        message = err instanceof ScripturalError ? err.message : fallback
    }

    async function change(action: () => Promise<unknown>, fallback: string) {
        busy = true
        message = ""
        try {
            await action()
        } catch (err) {
            fail(err, fallback)
        }
        await load()
        busy = false
    }

    // the owner changes admins; an admin changes editors and viewers
    const canChange = (person: Person) => manages && !person.is_me && person.member_role !== "owner" && (church.role === "owner" || person.member_role !== "admin")
    const nameOf = (person: Person) => person.member_email || "Someone in your church"

    let removing: Person | null = null
    async function remove(person: Person) {
        removing = null
        if (!person.is_me) return change(() => removeMember(church.id, person.member_id), "That person could not be removed.")
        try {
            await removeMember(church.id, person.member_id)
            dispatch("left")
        } catch (err) {
            fail(err, "You could not leave. Try again.")
        }
    }

    function copy(code: string) {
        navigator.clipboard.writeText(code)
        message = "Copied."
    }
</script>

<ul>
    {#each people as person (person.member_id)}
        <li>
            <div class="line">
                <span class="who">{nameOf(person)}{person.is_me ? " (you)" : ""}</span>
                {#if canChange(person)}
                    <MaterialDropdown label="Role" value={person.member_role} options={grantable.map((r) => ({ value: r, label: ROLE_NAMES[r] }))} disabled={busy} on:change={(e) => change(() => setMemberRole(church.id, person.member_id, e.detail), "The role could not be changed.")} />
                    <MaterialButton variant="text" small disabled={busy} on:click={() => (removing = person)}>Remove</MaterialButton>
                {:else}
                    <span class="muted">{ROLE_NAMES[person.member_role]}</span>
                    {#if person.is_me && person.member_role !== "owner"}
                        <MaterialButton variant="text" small disabled={busy} on:click={() => (removing = person)}>Leave</MaterialButton>
                    {/if}
                {/if}
            </div>
            {#if removing?.member_id === person.member_id}
                <ConfirmRow question={person.is_me ? `Leave ${church.name}? You lose its song library and Scriptural AI. Songs already on this computer stay.` : `Remove ${nameOf(person)} from ${church.name}? They lose its song library and Scriptural AI.`} action={person.is_me ? "Leave" : "Remove"} red on:cancel={() => (removing = null)} on:confirm={() => remove(person)} />
            {/if}
        </li>
    {/each}
</ul>
{#if !loaded && !message}<p class="muted">Loading.</p>{/if}

{#if loaded && manages}
    {#if invites.length}
        <h4>Invite codes not used yet</h4>
        <ul>
            {#each invites as invite (invite.id)}
                <li>
                    <div class="line">
                        <span class="who"><b class="code">{invite.code}</b> {ROLE_NAMES[invite.role]}, until {new Date(invite.expires_at).toLocaleDateString()}</span>
                        <MaterialButton variant="text" small icon="copy" on:click={() => copy(invite.code)}>Copy</MaterialButton>
                        <MaterialButton variant="text" small disabled={busy} on:click={() => change(() => revokeInvite(invite.id), "The code could not be cancelled.")}>Cancel code</MaterialButton>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    {#if full}
        <div class="actions">
            <p class="muted">Your plan has room for {maxMembers} people, and they are all taken.</p>
            {#if canPrompt}<MaterialButton variant="outlined" small on:click={() => dispatch("plans")}>See plans</MaterialButton>{/if}
        </div>
    {:else}
        <p class="muted">Someone joins by typing a code under Join. A code works once, for 14 days. Viewers can use the songs but not change them.</p>
        <div class="actions">
            <MaterialDropdown label="Their role" value={inviteRole} options={grantable.map((r) => ({ value: r, label: ROLE_NAMES[r] }))} on:change={(e) => (inviteRole = e.detail)} />
            <MaterialButton variant="outlined" small icon="add" disabled={busy} on:click={() => change(() => createInvite(church.id, inviteRole), "The invite could not be made.")}>Make invite code</MaterialButton>
        </div>
    {/if}
{/if}

{#if message}<p class="muted">{message}</p>{/if}

<style>
    p {
        margin: 0 0 8px;
    }
    .muted {
        opacity: 0.7;
    }
    ul {
        list-style: none;
        margin: 0 0 12px;
        padding: 0;
    }
    li {
        border-bottom: 1px solid var(--primary-lighter);
    }
    .line {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
    }
    .who {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
    }
    h4 {
        margin: 12px 0 4px;
    }
    .code {
        font-family: monospace;
        letter-spacing: 0.05em;
    }
</style>
