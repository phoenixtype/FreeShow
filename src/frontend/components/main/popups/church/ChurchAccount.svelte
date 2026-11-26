<script lang="ts">
    // export, hand over, delete. Anything that cannot be undone asks first and says what is lost.
    import { createEventDispatcher, onMount } from "svelte"
    import { churchPeople, deleteAccount, deleteChurch, exportSongs, transferOwnership, type Person } from "../../../../scriptural/churchAccount"
    import type { Church } from "../../../../scriptural/churchSync"
    import { churchLibrary, ScripturalError } from "../../../../scriptural/connection"
    import MaterialButton from "../../../inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../../inputs/MaterialDropdown.svelte"
    import MaterialTextInput from "../../../inputs/MaterialTextInput.svelte"
    import ConfirmRow from "./ConfirmRow.svelte"

    export let church: Church
    export let churches: Church[]
    export let email: string

    const dispatch = createEventDispatcher<{ changed: null; signedout: null }>()

    let people: Person[] = []
    let message = ""
    let busy = false
    let asking: "" | "transfer" | "church" | "account" = ""
    let typedName = ""
    let newOwner = ""

    $: owner = church.role === "owner"
    $: others = people.filter((p) => !p.is_me)
    $: chosen = others.find((p) => p.member_id === newOwner)
    $: nameMatches = typedName.trim().toLowerCase() === church.name.trim().toLowerCase()
    $: ownedNames = churches.filter((c) => c.role === "owner").map((c) => c.name)

    onMount(async () => {
        try {
            people = await churchPeople(church.id)
        } catch (err) {
            fail(err, "The list of people could not be loaded.")
        }
    })

    function fail(err: unknown, fallback: string) {
        message = err instanceof ScripturalError ? err.message : fallback
    }

    function ask(what: typeof asking) {
        asking = what
        typedName = ""
        message = ""
    }

    async function run(action: () => Promise<unknown>, fallback: string) {
        busy = true
        message = ""
        try {
            await action()
            asking = ""
        } catch (err) {
            fail(err, fallback)
        }
        busy = false
    }

    const download = () =>
        run(async () => {
            const url = URL.createObjectURL(new Blob([await exportSongs(church.id, church.name)], { type: "application/json" }))
            const link = document.createElement("a")
            link.href = url
            link.download = `${church.name.replace(/[^\p{L}\p{N} _-]/gu, "")} songs.json`
            link.click()
            URL.revokeObjectURL(url)
        }, "The songs could not be exported. Try again.")

    const transfer = () =>
        run(async () => {
            await transferOwnership(church.id, newOwner)
            dispatch("changed")
        }, "Ownership was not transferred.")

    const removeChurch = () =>
        run(async () => {
            await deleteChurch(church.id, typedName)
            dispatch("changed")
        }, "The church was not deleted.")

    const removeAccount = () =>
        run(async () => {
            await deleteAccount()
            await churchLibrary.signOut()
            dispatch("signedout")
        }, "Your account was not deleted.")
</script>

<div class="item">
    <p>Save a copy of {church.name}'s songs as a file.</p>
    <div class="actions">
        <MaterialButton variant="outlined" small icon="download" disabled={busy} on:click={download}>Export songs</MaterialButton>
    </div>
</div>

{#if owner}
    <div class="item">
        <p>Make someone else the owner. You become an admin.</p>
        {#if others.length}
            <div class="actions">
                <MaterialDropdown label="New owner" value={newOwner} options={others.map((p) => ({ value: p.member_id, label: p.member_email || p.member_id }))} on:change={(e) => (newOwner = e.detail)} />
                <MaterialButton variant="outlined" small disabled={busy || !chosen} on:click={() => ask("transfer")}>Transfer ownership</MaterialButton>
            </div>
        {:else}
            <p class="muted">Invite someone first.</p>
        {/if}
        {#if asking === "transfer" && chosen}
            <ConfirmRow question={`Make ${chosen.member_email} the owner of ${church.name}? Only they can undo this.`} action="Transfer" disabled={busy} on:cancel={() => ask("")} on:confirm={transfer} />
        {/if}
    </div>

    <div class="item">
        <p>Delete {church.name} and its library.</p>
        {#if asking === "church"}
            <ConfirmRow question={`This deletes ${church.name} for good: its songs, media files and service plans, and everyone in it${people.length > 1 ? ` (${people.length} people)` : ""} loses access. A paid plan is cancelled. Songs already on a computer stay there. This cannot be undone.`} action="Delete church" red disabled={busy || !nameMatches} on:cancel={() => ask("")} on:confirm={removeChurch}>
                <MaterialTextInput label={`Type ${church.name} to confirm`} value={typedName} on:input={(e) => (typedName = e.detail)} autofocus />
            </ConfirmRow>
        {:else}
            <div class="actions">
                <MaterialButton variant="text" small red on:click={() => ask("church")}>Delete church</MaterialButton>
            </div>
        {/if}
    </div>
{/if}

<div class="item">
    <p>Delete your account, {email}.</p>
    {#if asking === "account"}
        <ConfirmRow question={`This deletes the account ${email} for good.${ownedNames.length ? ` A church only you are in is deleted with all its songs. You own: ${ownedNames.join(", ")}. A church with other people needs a new owner first.` : " You leave every church you are in."} Songs already on this computer stay. This cannot be undone.`} action="Delete my account" red disabled={busy} on:cancel={() => ask("")} on:confirm={removeAccount} />
    {:else}
        <div class="actions">
            <MaterialButton variant="text" small red on:click={() => ask("account")}>Delete account</MaterialButton>
        </div>
    {/if}
</div>

{#if message}<p class="muted">{message}</p>{/if}

<style>
    p {
        margin: 0 0 8px;
    }
    .muted {
        opacity: 0.7;
    }
    .item {
        padding: 10px 0;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
    }
</style>
