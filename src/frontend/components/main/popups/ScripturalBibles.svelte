<script lang="ts">
    import { setActiveScripture } from "../../../converters/bible"
    import { scriptures } from "../../../stores"
    import { getSession, ScripturalError, sendSignInCode, signOut, verifySignInCode } from "../../../scriptural/connection"
    import { downloadedId, downloadVersion } from "../../../scriptural/download"
    import { SCRIPTURAL_VERSIONS, type ScripturalVersion } from "../../../scriptural/versions"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"

    let session = getSession()
    let email = session?.email || ""
    let code = ""
    let codeSent = false
    let busy = false
    let message = ""

    async function sendCode() {
        if (!email.includes("@")) {
            message = "Enter the email of your Scriptural account."
            return
        }
        busy = true
        message = ""
        try {
            await sendSignInCode(email)
            codeSent = true
            message = "We sent a code to that email."
        } catch (err) {
            message = err instanceof ScripturalError ? err.message : "Scriptural could not be reached. Try again."
        }
        busy = false
    }

    async function signIn() {
        busy = true
        message = ""
        try {
            session = await verifySignInCode(email, code)
            codeSent = false
            code = ""
        } catch (err) {
            message = err instanceof ScripturalError ? err.message : "That code did not work. Try again."
        }
        busy = false
    }

    async function leave() {
        await signOut()
        session = null
    }

    // which versions are downloading, and how far
    let progress: { [code: string]: number } = {}
    let errors: { [code: string]: string } = {}

    async function download(version: ScripturalVersion) {
        progress[version.code] = 0
        delete errors[version.code]
        try {
            await downloadVersion(version, (fraction) => (progress[version.code] = fraction))
            const id = downloadedId(version.code)
            if (id) setActiveScripture(id)
        } catch (err) {
            errors[version.code] = err instanceof ScripturalError ? err.message : "The download stopped. Try again."
        }
        delete progress[version.code]
        progress = progress
        errors = errors
    }

    let search = ""
    $: query = search.trim().toLowerCase()
    $: languageOrder = (language: string) => (language === "English" ? "" : language)
    $: shown = SCRIPTURAL_VERSIONS.filter((v) => !query || `${v.name} ${v.code} ${v.language}`.toLowerCase().includes(query)).sort((a, b) => languageOrder(a.language).localeCompare(languageOrder(b.language)))
    $: downloaded = Object.fromEntries(SCRIPTURAL_VERSIONS.map((v) => [v.code, !!Object.values($scriptures).find((s: any) => s?.scripturalVersion === v.code)]))
</script>

<section class="account">
    {#if session}
        <p>Signed in as {session.email}</p>
        <MaterialButton variant="text" small on:click={leave}>Sign out</MaterialButton>
    {:else}
        <p class="muted">Sign in with your Scriptural account to download licensed versions such as the NIV and NKJV. Public-domain versions download without signing in.</p>
        <div class="row">
            <MaterialTextInput label="Email" type="email" value={email} on:input={(e) => (email = e.detail)} />
            {#if codeSent}
                <MaterialTextInput label="Code" value={code} on:input={(e) => (code = e.detail)} autofocus />
                <MaterialButton variant="contained" disabled={busy || code.trim().length < 6} on:click={signIn}>Sign in</MaterialButton>
            {:else}
                <MaterialButton variant="outlined" disabled={busy} on:click={sendCode}>Send code</MaterialButton>
            {/if}
        </div>
    {/if}
    {#if message}<p class="muted">{message}</p>{/if}
</section>

<MaterialTextInput label="Search versions" value={search} on:input={(e) => (search = e.detail)} />

<ul>
    {#each shown as version (version.code)}
        <li>
            <div class="name">
                <span>{version.name}</span>
                <span class="muted">{version.code}, {version.language}</span>
                {#if errors[version.code]}<span class="error">{errors[version.code]}</span>{/if}
            </div>

            {#if progress[version.code] !== undefined}
                <span class="muted">{Math.round(progress[version.code] * 100)}%</span>
            {:else if version.licensed && !session && !downloaded[version.code]}
                <span class="muted">Sign in to download</span>
            {:else}
                <MaterialButton variant="outlined" small on:click={() => download(version)}>{downloaded[version.code] ? "Update" : "Download"}</MaterialButton>
            {/if}
        </li>
    {/each}
</ul>

<style>
    .account {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }
    .account > p {
        margin: 0;
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .muted {
        opacity: 0.7;
        font-size: 0.9em;
    }
    .error {
        color: var(--text);
        font-size: 0.9em;
    }

    ul {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        max-height: 50vh;
        overflow: auto;
    }
    li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 4px;
        border-bottom: 1px solid var(--primary-lighter);
    }
    .name {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
</style>
