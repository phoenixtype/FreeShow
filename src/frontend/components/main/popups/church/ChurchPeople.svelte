<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import { churchPeople, openInvites, removeMember, revokeInvite, ROLE_NAMES, rolesICanGive, setMemberRole, type Invite, type Person, type Role } from "../../../../scriptural/churchAccount"
    import { createInvite, type Church } from "../../../../scriptural/churchSync"
    import { ScripturalError } from "../../../../scriptural/connection"
    import { dictionary } from "../../../../stores"
    import { translateText } from "../../../../utils/language"
    import T from "../../../helpers/T.svelte"
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
            fail(err, translateText("account.people_failed_retry"))
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
    const nameOf = (person: Person) => person.member_email || translateText("account.someone")

    let removing: Person | null = null
    async function remove(person: Person) {
        removing = null
        if (!person.is_me) return change(() => removeMember(church.id, person.member_id), translateText("account.remove_failed"))
        try {
            await removeMember(church.id, person.member_id)
            dispatch("left")
        } catch (err) {
            fail(err, translateText("account.leave_failed"))
        }
    }

    function copy(code: string) {
        navigator.clipboard.writeText(code)
        message = translateText("account.copied")
    }
</script>

<ul>
    {#each people as person (person.member_id)}
        <li>
            <div class="line">
                <span class="who">{nameOf(person)}{person.is_me ? ` ${translateText("account.you", $dictionary)}` : ""}</span>
                {#if canChange(person)}
                    <MaterialDropdown label="account.role" value={person.member_role} options={grantable.map((r) => ({ value: r, label: ROLE_NAMES[r] }))} disabled={busy} on:change={(e) => change(() => setMemberRole(church.id, person.member_id, e.detail), translateText("account.role_failed"))} />
                    <MaterialButton variant="text" small disabled={busy} on:click={() => (removing = person)}><T id="account.remove" /></MaterialButton>
                {:else}
                    <span class="muted">{ROLE_NAMES[person.member_role]}</span>
                    {#if person.is_me && person.member_role !== "owner"}
                        <MaterialButton variant="text" small disabled={busy} on:click={() => (removing = person)}><T id="account.leave" /></MaterialButton>
                    {/if}
                {/if}
            </div>
            {#if removing?.member_id === person.member_id}
                <ConfirmRow question={person.is_me ? translateText("account.leave_question", $dictionary, [church.name]) : translateText("account.remove_question", $dictionary, [nameOf(person), church.name])} action={person.is_me ? translateText("account.leave", $dictionary) : translateText("account.remove", $dictionary)} red on:cancel={() => (removing = null)} on:confirm={() => remove(person)} />
            {/if}
        </li>
    {/each}
</ul>
{#if !loaded && !message}<p class="muted"><T id="account.loading" /></p>{/if}

{#if loaded && manages}
    {#if invites.length}
        <h4><T id="account.invites_unused" /></h4>
        <ul>
            {#each invites as invite (invite.id)}
                <li>
                    <div class="line">
                        <span class="who"><b class="code">{invite.code}</b> {ROLE_NAMES[invite.role]}<T id="account.invite_until" replace={[new Date(invite.expires_at).toLocaleDateString()]} /></span>
                        <MaterialButton variant="text" small icon="copy" on:click={() => copy(invite.code)}><T id="account.copy" /></MaterialButton>
                        <MaterialButton variant="text" small disabled={busy} on:click={() => change(() => revokeInvite(invite.id), translateText("account.cancel_code_failed"))}><T id="account.cancel_code" /></MaterialButton>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    {#if full}
        <div class="actions">
            <p class="muted"><T id="account.people_full" replace={[String(maxMembers)]} /></p>
            {#if canPrompt}<MaterialButton variant="outlined" small on:click={() => dispatch("plans")}><T id="account.see_plans" /></MaterialButton>{/if}
        </div>
    {:else}
        <p class="muted"><T id="account.how_to_join" /></p>
        <div class="actions">
            <MaterialDropdown label="account.their_role" value={inviteRole} options={grantable.map((r) => ({ value: r, label: ROLE_NAMES[r] }))} on:change={(e) => (inviteRole = e.detail)} />
            <MaterialButton variant="outlined" small icon="add" disabled={busy} on:click={() => change(() => createInvite(church.id, inviteRole), translateText("account.invite_failed"))}><T id="account.make_invite" /></MaterialButton>
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
