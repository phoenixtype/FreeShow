<script lang="ts">
    import { onMount } from "svelte"
    import { churchLibrary, ScripturalError } from "../../../scriptural/connection"
    import { createChurch, joinChurch, myChurches, pushSongs, syncSongs, type Church } from "../../../scriptural/churchSync"
    import { ACTIVE_CHURCH_KEY } from "../../../scriptural/ai"
    import { Main } from "../../../../types/IPC/Main"
    import { sendMain } from "../../../IPC/main"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"

    const ACTIVE_KEY = ACTIVE_CHURCH_KEY

    let session = churchLibrary.getSession()
    let email = session?.email || ""
    let code = ""
    let codeSent = false
    let busy = false
    let message = ""

    let churches: Church[] = []
    let activeId = localStorage.getItem(ACTIVE_KEY) || ""
    let newChurchName = ""
    let inviteCode = ""

    const errorText = (err: unknown, fallback: string) => (err instanceof ScripturalError ? err.message : fallback)

    async function loadChurches() {
        if (!session) return
        try {
            churches = await myChurches()
            if (!churches.find((c) => c.id === activeId)) activeId = churches[0]?.id || ""
        } catch (err) {
            message = errorText(err, "Could not load your churches. Try again.")
        }
    }
    onMount(loadChurches)

    async function sendCode() {
        if (!email.includes("@")) {
            message = "Enter your email."
            return
        }
        busy = true
        message = ""
        try {
            await churchLibrary.sendSignInCode(email)
            codeSent = true
            message = "We sent a code to that email."
        } catch (err) {
            message = errorText(err, "The code could not be sent. Try again.")
        }
        busy = false
    }

    async function signIn() {
        busy = true
        message = ""
        try {
            session = await churchLibrary.verifySignInCode(email, code)
            codeSent = false
            code = ""
            await loadChurches()
        } catch (err) {
            message = errorText(err, "That code did not work. Try again.")
        }
        busy = false
    }

    async function leave() {
        await churchLibrary.signOut()
        session = null
        churches = []
    }

    async function startChurch() {
        busy = true
        try {
            activeId = await createChurch(newChurchName)
            newChurchName = ""
            await loadChurches()
        } catch (err) {
            message = errorText(err, "The church could not be created. Try again.")
        }
        busy = false
    }

    async function join() {
        busy = true
        try {
            activeId = await joinChurch(inviteCode)
            inviteCode = ""
            await loadChurches()
        } catch (err) {
            message = errorText(err, "That invite code did not work.")
        }
        busy = false
    }

    let syncing = false
    let received = 0
    async function sync() {
        syncing = true
        message = ""
        received = 0
        try {
            const sent = await pushSongs(activeId)
            const count = await syncSongs(activeId, (n) => (received = n))
            message = [sent ? `${sent} songs sent to the library.` : "", count ? `${count} songs updated on this computer.` : "", !sent && !count ? "Everything is already up to date." : ""].filter(Boolean).join(" ")
        } catch (err) {
            message = errorText(err, "The sync stopped. Try again.")
        }
        syncing = false
    }

    $: if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)

    // PLAN //
    const PLAN_NAMES = { free: "Free", church: "Church", multi_campus: "Multi-campus" }
    let plan = ""
    $: if (activeId && session) loadPlan(activeId)
    async function loadPlan(id: string) {
        try {
            const { data } = await churchLibrary.rest<{ plan: string }[]>("rpc/church_limits", { method: "POST", body: { target: id } })
            plan = data?.[0]?.plan || "free"
        } catch {
            plan = ""
        }
    }

    async function openBilling(fn: "billing-checkout" | "billing-portal", price?: string) {
        message = ""
        const { ok, data } = await churchLibrary.invoke<{ url?: string; message?: string }>(fn, { churchId: activeId, price })
        if (ok && data.url) sendMain(Main.URL, data.url)
        else message = data.message || "Billing is not available right now."
    }
</script>

{#if !session}
    <p class="muted">Sign in to keep your church's songs on this computer and in step with everyone else's.</p>
    <div class="row">
        <MaterialTextInput label="Email" type="email" value={email} on:input={(e) => (email = e.detail)} />
        {#if codeSent}
            <MaterialTextInput label="Code" value={code} on:input={(e) => (code = e.detail)} autofocus />
            <MaterialButton variant="contained" disabled={busy || code.trim().length < 6} on:click={signIn}>Sign in</MaterialButton>
        {:else}
            <MaterialButton variant="outlined" disabled={busy} on:click={sendCode}>Send code</MaterialButton>
        {/if}
    </div>
{:else}
    <div class="row spaced">
        <p>Signed in as {session.email}</p>
        <MaterialButton variant="text" small on:click={leave}>Sign out</MaterialButton>
    </div>

    {#if churches.length}
        <ul>
            {#each churches as church (church.id)}
                <li>
                    <label>
                        <input type="radio" bind:group={activeId} value={church.id} />
                        {church.name}
                    </label>
                </li>
            {/each}
        </ul>

        <div class="row end">
            {#if syncing}<span class="muted">{received} songs received</span>{/if}
            <MaterialButton variant="contained" disabled={syncing || !activeId} on:click={sync}>Sync songs</MaterialButton>
        </div>

        {#if plan}
            <div class="row spaced">
                <p>{PLAN_NAMES[plan] || plan} plan</p>
                <div class="row">
                    {#if plan === "free"}
                        <MaterialButton variant="outlined" small on:click={() => openBilling("billing-checkout", "church_monthly")}>Church, $19 a month</MaterialButton>
                        <MaterialButton variant="outlined" small on:click={() => openBilling("billing-checkout", "church_yearly")}>$190 a year</MaterialButton>
                    {:else}
                        <MaterialButton variant="text" small on:click={() => openBilling("billing-portal")}>Manage billing</MaterialButton>
                    {/if}
                </div>
            </div>
        {/if}
    {:else}
        <p class="muted">You are not in a church library yet. Start one, or join with a code someone in your church shared.</p>
    {/if}

    <hr />
    <div class="row">
        <MaterialTextInput label="New church name" value={newChurchName} on:input={(e) => (newChurchName = e.detail)} />
        <MaterialButton variant="outlined" disabled={busy || newChurchName.trim().length < 2} on:click={startChurch}>Start</MaterialButton>
    </div>
    <div class="row">
        <MaterialTextInput label="Invite code" value={inviteCode} on:input={(e) => (inviteCode = e.detail)} />
        <MaterialButton variant="outlined" disabled={busy || inviteCode.trim().length < 6} on:click={join}>Join</MaterialButton>
    </div>
{/if}

{#if message}<p class="muted">{message}</p>{/if}

<style>
    p {
        margin: 0 0 8px;
    }
    .muted {
        opacity: 0.7;
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
    }
    .spaced {
        justify-content: space-between;
    }
    .end {
        justify-content: flex-end;
    }
    ul {
        list-style: none;
        margin: 8px 0;
        padding: 0;
    }
    li {
        padding: 8px 4px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    label {
        display: flex;
        gap: 10px;
        align-items: center;
        cursor: pointer;
    }
    hr {
        border: none;
        border-top: 1px solid var(--primary-lighter);
        margin: 16px 0;
    }
</style>
