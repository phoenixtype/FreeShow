<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { churchLibrary, ScripturalError } from "../../../scriptural/connection"
    import { createChurch, createInvite, joinChurch, myChurches, syncChurch, syncStatus, type Church } from "../../../scriptural/churchSync"
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

    let withGoogle = false
    async function continueWithGoogle() {
        withGoogle = true
        message = ""
        try {
            session = (await churchLibrary.signInWithGoogle()) || session
            if (session) await loadChurches()
        } catch (err) {
            message = errorText(err, "Google could not sign you in. Try again.")
        }
        withGoogle = false
    }
    onDestroy(() => withGoogle && sendMain(Main.BROWSER_SIGN_IN_CANCEL))

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
        syncStatus.set({ running: false, at: null, error: "" })
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

    let received = 0
    $: syncing = $syncStatus.running
    async function sync() {
        message = ""
        received = 0
        try {
            const done = await syncChurch(activeId, (n) => (received = n))
            message = [done.sent ? `${done.sent} songs sent to the library.` : "", done.received ? `${done.received} songs updated on this computer.` : "", !done.sent && !done.received && !done.refused ? "Everything is already up to date." : "", done.refused].filter(Boolean).join(" ")
        } catch (err) {
            message = errorText(err, "The sync stopped. Try again.")
        }
    }
    const syncedAt = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

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
    let overPlan = false
    $: if (activeId && session) loadPlan(activeId)
    async function loadPlan(id: string) {
        try {
            const { data } = await churchLibrary.rest<{ plan: string }[]>("rpc/church_limits", { method: "POST", body: { target: id } })
            plan = data?.[0]?.plan || "free"
            const within = await churchLibrary.rest<boolean>("rpc/church_within_plan", { method: "POST", body: { target: id } }).catch(() => null)
            overPlan = within?.data === false
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
    <p class="muted">Your church's songs, plan and Scriptural AI, on every computer. No password.</p>
    <div class="google">
        {#if withGoogle}
            <p class="muted">Finish in your browser, then come back here.</p>
            <MaterialButton variant="text" small on:click={() => sendMain(Main.BROWSER_SIGN_IN_CANCEL)}>Cancel</MaterialButton>
        {:else}
            <MaterialButton variant="contained" on:click={continueWithGoogle}>
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"
                    ><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    /></svg
                >
                Continue with Google
            </MaterialButton>
        {/if}
    </div>
    <p class="muted">Or we email you a code.</p>
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
            <p class="muted">
                {#if syncing}Syncing. {received ? `${received} songs received` : ""}
                {:else if $syncStatus.error}{$syncStatus.error}
                {:else if $syncStatus.at}Last synced at {syncedAt($syncStatus.at)}. Press Sync now after you change songs.
                {:else}Press Sync now to send your songs and get the library's.{/if}
            </p>
            <MaterialButton variant="contained" icon="refresh" disabled={syncing || !activeId} on:click={sync}>Sync now</MaterialButton>
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

        {#if overPlan}
            <p class="muted">Your church is over its plan, so new songs, files and people cannot be added. You can still open and download everything.</p>
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
    .google {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 12px 0;
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
