<script lang="ts">
    import { onMount } from "svelte"
    import { churchLibrary, ScripturalError } from "../../../scriptural/connection"
    import { createChurch, createInvite, joinChurch, myChurches, pushSongs, syncSongs, type Church } from "../../../scriptural/churchSync"
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
    $: active = churches.find((c) => c.id === activeId)
    $: canInvite = active?.role === "owner" || active?.role === "admin"

    // INVITE //
    let invite: { code: string; expiresAt: string } | null = null
    $: if (activeId) invite = null
    async function makeInvite() {
        message = ""
        try {
            invite = await createInvite(activeId)
        } catch (err) {
            message = errorText(err, "The invite could not be made. Try again.")
        }
    }
    function copyInvite() {
        if (invite) navigator.clipboard.writeText(invite.code)
        message = "Copied."
    }

    // starting or joining another church is tucked away once you are in one
    let showOther = false

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
    <p class="muted">Keep your church's songs in one place, on every computer. Sign in with your email; we send a code, no password.</p>
    <div class="row">
        <MaterialTextInput label="Email" type="email" value={email} on:input={(e) => (email = e.detail)} />
        {#if codeSent}
            <MaterialTextInput label="Code from the email" value={code} on:input={(e) => (code = e.detail)} autofocus />
            <MaterialButton variant="contained" disabled={busy || code.trim().length < 6} on:click={signIn}>Sign in</MaterialButton>
        {:else}
            <MaterialButton variant="contained" disabled={busy} on:click={sendCode}>Send code</MaterialButton>
        {/if}
    </div>
{:else}
    {#if churches.length}
        {#if churches.length > 1}
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
        {:else}
            <h3>{active?.name}</h3>
        {/if}

        <div class="row spaced">
            <p class="muted">{syncing ? `${received} songs received` : "Sends your changes and brings in everyone else's."}</p>
            <MaterialButton variant="contained" icon="refresh" disabled={syncing || !activeId} on:click={sync}>Sync songs</MaterialButton>
        </div>

        {#if canInvite}
            <div class="row spaced">
                {#if invite}
                    <p>Invite code <b class="code">{invite.code}</b>. They enter it under Join. It works for 14 days.</p>
                    <MaterialButton variant="outlined" small icon="copy" on:click={copyInvite}>Copy</MaterialButton>
                {:else}
                    <p class="muted">Bring in your worship team and media volunteers.</p>
                    <MaterialButton variant="outlined" small icon="add" on:click={makeInvite}>Invite someone</MaterialButton>
                {/if}
            </div>
        {/if}

        {#if plan}
            <div class="row spaced">
                <p class="muted">{PLAN_NAMES[plan] || plan} plan</p>
                <div class="row">
                    <!-- only owners and admins can pay; billing-checkout refuses anyone else -->
                    {#if plan === "free" && canInvite}
                        <MaterialButton variant="outlined" small on:click={() => openBilling("billing-checkout", "church_monthly")}>Church, $19 a month</MaterialButton>
                        <MaterialButton variant="outlined" small on:click={() => openBilling("billing-checkout", "church_yearly")}>$190 a year</MaterialButton>
                    {:else if canInvite}
                        <MaterialButton variant="text" small on:click={() => openBilling("billing-portal")}>Manage billing</MaterialButton>
                    {/if}
                </div>
            </div>
        {/if}
    {:else}
        <p class="muted">Start your church's library, or join one with the invite code someone sent you.</p>
    {/if}

    {#if !churches.length || showOther}
        <hr />
        <div class="row">
            <MaterialTextInput label="Church name" value={newChurchName} on:input={(e) => (newChurchName = e.detail)} />
            <MaterialButton variant="outlined" disabled={busy || newChurchName.trim().length < 2} on:click={startChurch}>Start</MaterialButton>
        </div>
        <div class="row">
            <MaterialTextInput label="Invite code" value={inviteCode} on:input={(e) => (inviteCode = e.detail)} />
            <MaterialButton variant="outlined" disabled={busy || inviteCode.trim().length < 6} on:click={join}>Join</MaterialButton>
        </div>
    {/if}

    <div class="row spaced footer">
        <p class="muted">Signed in as {session.email}</p>
        <div class="row">
            {#if churches.length && !showOther}
                <MaterialButton variant="text" small on:click={() => (showOther = true)}>Start or join another</MaterialButton>
            {/if}
            <MaterialButton variant="text" small on:click={leave}>Sign out</MaterialButton>
        </div>
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
    h3 {
        margin: 0 0 12px;
    }
    .code {
        font-family: monospace;
        letter-spacing: 0.05em;
    }
    .footer {
        margin-top: 12px;
    }
    hr {
        border: none;
        border-top: 1px solid var(--primary-lighter);
        margin: 16px 0;
    }
</style>
