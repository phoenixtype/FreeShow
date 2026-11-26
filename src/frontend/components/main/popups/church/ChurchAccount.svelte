<script lang="ts">
    // export, hand over, delete. Anything that cannot be undone asks first and says what is lost.
    import { escapeHtml } from "../../../../utils/escapeHtml"
    import { createEventDispatcher, onMount } from "svelte"
    import { churchPeople, deleteAccount, deleteChurch, exportSongs, transferOwnership, type Person } from "../../../../scriptural/churchAccount"
    import type { Church } from "../../../../scriptural/churchSync"
    import { churchLibrary, ScripturalError } from "../../../../scriptural/connection"
    import { dictionary } from "../../../../stores"
    import { translateText } from "../../../../utils/language"
    import T from "../../../helpers/T.svelte"
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
            fail(err, translateText("account.people_failed"))
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
        }, translateText("account.export_failed"))

    const transfer = () =>
        run(async () => {
            await transferOwnership(church.id, newOwner)
            dispatch("changed")
        }, translateText("account.transfer_failed"))

    const removeChurch = () =>
        run(async () => {
            await deleteChurch(church.id, typedName)
            dispatch("changed")
        }, translateText("account.church_not_deleted"))

    const removeAccount = () =>
        run(async () => {
            await deleteAccount()
            await churchLibrary.signOut()
            dispatch("signedout")
        }, translateText("account.account_not_deleted"))
</script>

<div class="item">
    <p><T id="account.export_note" replace={[church.name]} /></p>
    <div class="actions">
        <MaterialButton variant="outlined" small icon="download" disabled={busy} on:click={download}><T id="account.export_songs" /></MaterialButton>
    </div>
</div>

{#if owner}
    <div class="item">
        <p><T id="account.transfer_note" /></p>
        {#if others.length}
            <div class="actions">
                <MaterialDropdown label="account.new_owner" value={newOwner} options={others.map((p) => ({ value: p.member_id, label: p.member_email || p.member_id }))} on:change={(e) => (newOwner = e.detail)} />
                <MaterialButton variant="outlined" small disabled={busy || !chosen} on:click={() => ask("transfer")}><T id="account.transfer_ownership" /></MaterialButton>
            </div>
        {:else}
            <p class="muted"><T id="account.invite_first" /></p>
        {/if}
        {#if asking === "transfer" && chosen}
            <ConfirmRow question={translateText("account.transfer_question", $dictionary, [String(chosen.member_email), church.name])} action={translateText("account.transfer", $dictionary)} disabled={busy} on:cancel={() => ask("")} on:confirm={transfer} />
        {/if}
    </div>

    <div class="item">
        <p><T id="account.delete_church_note" replace={[church.name]} /></p>
        {#if asking === "church"}
            <ConfirmRow question={translateText("account.delete_church_question", $dictionary, [church.name, people.length > 1 ? ` ${translateText("account.people_count", $dictionary, [String(people.length)])}` : ""])} action={translateText("account.delete_church", $dictionary)} red disabled={busy || !nameMatches} on:cancel={() => ask("")} on:confirm={removeChurch}>
                <MaterialTextInput label={translateText("account.type_to_confirm", $dictionary, [escapeHtml(church.name)])} value={typedName} on:input={(e) => (typedName = e.detail)} autofocus />
            </ConfirmRow>
        {:else}
            <div class="actions">
                <MaterialButton variant="text" small red on:click={() => ask("church")}><T id="account.delete_church" /></MaterialButton>
            </div>
        {/if}
    </div>
{/if}

<div class="item">
    <p><T id="account.delete_account_note" replace={[email]} /></p>
    {#if asking === "account"}
        <ConfirmRow question={translateText("account.delete_account_question", $dictionary, [email, ownedNames.length ? translateText("account.delete_account_owned", $dictionary, [ownedNames.join(", ")]) : translateText("account.delete_account_leave", $dictionary)])} action={translateText("account.delete_my_account", $dictionary)} red disabled={busy} on:cancel={() => ask("")} on:confirm={removeAccount} />
    {:else}
        <div class="actions">
            <MaterialButton variant="text" small red on:click={() => ask("account")}><T id="account.delete_account" /></MaterialButton>
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
