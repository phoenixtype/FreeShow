<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { churchLibrary, ScripturalError } from "../../../scriptural/connection"
    import { createChurch, forgetRefusals, joinChurch, myChurches, syncChurch, syncStatus, type Church } from "../../../scriptural/churchSync"
    import { isLive, loadPlanState, PLAN_NAMES, type PlanState } from "../../../scriptural/churchAccount"
    import { ACTIVE_CHURCH_KEY } from "../../../scriptural/ai"
    import { Main } from "../../../../types/IPC/Main"
    import { sendMain } from "../../../IPC/main"
    import { dictionary, outputs } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import T from "../../helpers/T.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import ChurchAccount from "./church/ChurchAccount.svelte"
    import ChurchPeople from "./church/ChurchPeople.svelte"
    import ChurchPlan from "./church/ChurchPlan.svelte"

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
            message = errorText(err, translateText("account.load_churches_failed"))
        }
    }
    onMount(loadChurches)

    async function sendCode() {
        if (!email.includes("@")) {
            message = translateText("account.enter_email")
            return
        }
        busy = true
        message = ""
        try {
            await churchLibrary.sendSignInCode(email)
            codeSent = true
            message = translateText("account.code_sent")
        } catch (err) {
            message = errorText(err, translateText("account.code_failed"))
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
            message = errorText(err, translateText("account.google_failed"))
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
            message = errorText(err, translateText("account.code_wrong"))
        }
        busy = false
    }

    function signedOut() {
        syncStatus.set({ running: false, at: null, error: "" })
        session = null
        churches = []
        view = "songs"
    }
    async function signOut() {
        await churchLibrary.signOut()
        signedOut()
    }

    async function startChurch() {
        busy = true
        try {
            activeId = await createChurch(newChurchName)
            newChurchName = ""
            await loadChurches()
        } catch (err) {
            message = errorText(err, translateText("account.church_create_failed"))
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
            message = errorText(err, translateText("account.invite_wrong"))
        }
        busy = false
    }

    let received = 0
    let planFull = false
    $: syncing = $syncStatus.running
    async function sync() {
        message = ""
        received = 0
        planFull = false
        try {
            const done = await syncChurch(activeId, (n) => (received = n))
            planFull = done.planRefused
            const lines = [
                done.sent ? translateText("account.songs_sent", null, [String(done.sent)]) : "",
                done.removed ? translateText("account.songs_removed", null, [String(done.removed)]) : "",
                done.received ? translateText("account.songs_updated", null, [String(done.received)]) : "",
                ...done.conflicts.map((title) => translateText("account.song_conflict", null, [title, `${title} (this computer's copy)`])),
                done.held ? translateText("account.songs_held", null, [String(done.held)]) : "",
                done.refused
            ].filter(Boolean)
            message = lines.join(" ") || translateText("account.up_to_date")
        } catch (err) {
            message = errorText(err, translateText("account.sync_stopped"))
        }
    }
    const syncedAt = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

    // one part of the church at a time, so each fits the window
    type View = "songs" | "people" | "plan" | "account"
    const VIEWS: [View, string][] = [
        ["songs", "account.view_songs"],
        ["people", "account.view_people"],
        ["plan", "account.view_plan"],
        ["account", "account.view_account"]
    ]
    let view: View = "songs"
    function show(next: View) {
        view = next
        message = ""
    }

    $: if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
    $: active = churches.find((c) => c.id === activeId)
    $: canPay = active?.role === "owner" || active?.role === "admin"
    // no upgrade prompts while something is on a screen
    $: canPrompt = !isLive($outputs)
    $: if (activeId) planFull = false

    // starting or joining another church is tucked away once you are in one
    let showOther = false

    // PLAN //
    let planState: PlanState | null = null
    // over the limits of the plan it is on now: nothing is lost, but nothing can be added
    let overPlan = false
    $: if (activeId && session) loadPlan(activeId)
    async function loadPlan(id: string) {
        if (id !== activeId) return
        try {
            const state = await loadPlanState(id)
            if (id !== activeId) return
            // a new plan: songs refused under the old one are tried again
            const seenKey = `church-library-plan:${id}`
            const seen = localStorage.getItem(seenKey)
            if (seen && seen !== state.plan) forgetRefusals(id)
            localStorage.setItem(seenKey, state.plan)
            planState = state
            const within = await churchLibrary.rest<boolean>("rpc/church_within_plan", { method: "POST", body: { target: id } }).catch(() => null)
            if (id === activeId) overPlan = within?.data === false
        } catch {
            planState = null
            overPlan = false
        }
    }

    // paying happens in the browser: read the plan again on coming back
    let billingOpened = false
    function backInTheApp() {
        if (billingOpened && activeId && session) loadPlan(activeId)
    }

    async function openBilling(fn: "billing-checkout" | "billing-portal", price?: string) {
        message = ""
        try {
            const { ok, data } = await churchLibrary.invoke<{ url?: string; message?: string }>(fn, { churchId: activeId, price })
            if (ok && data.url) {
                billingOpened = true
                sendMain(Main.URL, data.url)
            } else message = data.message || translateText("account.billing_unavailable")
        } catch (err) {
            message = errorText(err, translateText("account.billing_unreachable"))
        }
    }

    async function churchChanged() {
        view = "songs"
        planState = null
        await loadChurches()
        if (activeId) loadPlan(activeId)
    }
</script>

<svelte:window on:focus={backInTheApp} />

{#if !session}
    <p class="muted"><T id="account.library_intro" /></p>
    <div class="actions google">
        {#if withGoogle}
            <p class="muted"><T id="account.finish_in_browser" /></p>
            <MaterialButton variant="text" small on:click={() => sendMain(Main.BROWSER_SIGN_IN_CANCEL)}><T id="account.cancel" /></MaterialButton>
        {:else}
            <MaterialButton variant="contained" on:click={continueWithGoogle}>
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"
                    ><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    /></svg
                >
                <T id="account.continue_google" />
            </MaterialButton>
        {/if}
    </div>
    <p class="muted"><T id="account.or_code" /></p>
    <div class="actions">
        <MaterialTextInput label="account.email" type="email" value={email} on:input={(e) => (email = e.detail)} />
        {#if codeSent}
            <MaterialTextInput label="account.email_code" value={code} on:input={(e) => (code = e.detail)} autofocus />
            <MaterialButton variant="contained" disabled={busy || code.trim().length < 6} on:click={signIn}><T id="account.sign_in" /></MaterialButton>
        {:else}
            <MaterialButton variant="contained" disabled={busy} on:click={sendCode}><T id="account.send_code" /></MaterialButton>
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

        <div class="actions views">
            {#each VIEWS as [id, name]}
                <MaterialButton variant="text" small isActive={view === id} on:click={() => show(id)}>{translateText(name, $dictionary)}</MaterialButton>
            {/each}
        </div>

        {#if planState?.paymentFailed}
            <div class="spaced row">
                <p><T id="account.payment_failed" /></p>
                {#if canPay}<MaterialButton variant="outlined" small on:click={() => openBilling("billing-portal")}><T id="account.update_card" /></MaterialButton>{/if}
            </div>
        {/if}

        {#if view === "songs"}
            {#if overPlan}
                <p class="muted"><T id="account.over_plan" /></p>
            {/if}
            <div class="row spaced">
                <p class="muted">
                    {#if syncing}<T id="account.syncing" /> {received ? translateText("account.songs_received", $dictionary, [String(received)]) : ""}
                    {:else if $syncStatus.error}{$syncStatus.error}
                    {:else if $syncStatus.at}<T id="account.last_synced" replace={[syncedAt($syncStatus.at)]} />
                    {:else}<T id="account.press_sync" />{/if}
                </p>
                <MaterialButton variant="contained" icon="refresh" disabled={syncing || !activeId} on:click={sync}><T id="account.sync_now" /></MaterialButton>
            </div>

            {#if planFull && canPrompt}
                <div class="row spaced">
                    <p class="muted">{canPay ? translateText("account.plan_full", $dictionary) : translateText("account.plan_full_ask", $dictionary)}</p>
                    {#if canPay}<MaterialButton variant="outlined" small on:click={() => show("plan")}><T id="account.see_plans" /></MaterialButton>{/if}
                </div>
            {/if}
        {:else if active}
            {#key active.id}
                {#if view === "people"}
                    <ChurchPeople church={active} maxMembers={planState?.maxMembers} canPrompt={canPrompt && canPay} on:plans={() => show("plan")} on:left={churchChanged} />
                {:else if view === "plan"}
                    {#if planState}
                        <ChurchPlan state={planState} {canPay} on:checkout={(e) => openBilling("billing-checkout", e.detail)} on:portal={() => openBilling("billing-portal")} />
                    {:else}
                        <p class="muted"><T id="account.plan_not_loaded" /></p>
                    {/if}
                {:else}
                    <ChurchAccount church={active} {churches} email={session.email} on:changed={churchChanged} on:signedout={signedOut} />
                {/if}
            {/key}
        {/if}

        {#if view === "songs" && planState}
            <div class="row spaced">
                <p class="muted"><T id="account.named_plan" replace={[PLAN_NAMES[planState.plan] || planState.plan]} /></p>
                {#if planState.plan === "free" && canPay && canPrompt}
                    <MaterialButton variant="text" small on:click={() => show("plan")}><T id="account.see_plans" /></MaterialButton>
                {/if}
            </div>
        {/if}
    {:else}
        <p class="muted"><T id="account.start_or_join" /></p>
    {/if}

    {#if !churches.length || showOther}
        <hr />
        <div class="actions">
            <MaterialTextInput label="account.church_name" value={newChurchName} on:input={(e) => (newChurchName = e.detail)} />
            <MaterialButton variant="outlined" disabled={busy || newChurchName.trim().length < 2} on:click={startChurch}><T id="account.start" /></MaterialButton>
        </div>
        <div class="actions">
            <MaterialTextInput label="account.invite_code" value={inviteCode} on:input={(e) => (inviteCode = e.detail)} />
            <MaterialButton variant="outlined" disabled={busy || inviteCode.trim().length < 6} on:click={join}><T id="account.join" /></MaterialButton>
        </div>
    {/if}

    <div class="row spaced footer">
        <p class="muted"><T id="account.signed_in_as" replace={[session.email]} /></p>
        <div class="actions">
            {#if churches.length && !showOther}
                <MaterialButton variant="text" small on:click={() => (showOther = true)}><T id="account.start_or_join_another" /></MaterialButton>
            {/if}
            <MaterialButton variant="text" small on:click={signOut}><T id="account.sign_out" /></MaterialButton>
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
    .actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }
    .google {
        margin: 12px 0;
    }
    .views {
        border-bottom: 1px solid var(--primary-lighter);
        padding-bottom: 8px;
    }
    .spaced {
        justify-content: space-between;
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
    .footer {
        margin-top: 12px;
    }
    hr {
        border: none;
        border-top: 1px solid var(--primary-lighter);
        margin: 16px 0;
    }
</style>
