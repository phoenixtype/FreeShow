<script lang="ts">
    import { onMount } from "svelte"
    import { setActiveScripture } from "../../../converters/bible"
    import { scriptures } from "../../../stores"
    import { ACTIVE_CHURCH_KEY } from "../../../scriptural/ai"
    import { churchLibrary, ScripturalError } from "../../../scriptural/connection"
    import { downloadedId, downloadVersion } from "../../../scriptural/download"
    import { SCRIPTURAL_VERSIONS, type ScripturalVersion } from "../../../scriptural/versions"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"

    // Public-domain versions are free for everyone. Licensed ones come with a
    // Church plan, once Samuel grants the church's request.
    const churchId = localStorage.getItem(ACTIVE_CHURCH_KEY) || ""
    const signedIn = !!churchLibrary.getSession() && !!churchId
    let plan = "free"
    let requests: { [code: string]: string } = {}

    onMount(async () => {
        if (!signedIn) return
        try {
            const [{ data: limits }, { data: rows }] = await Promise.all([churchLibrary.rest<{ plan: string }[]>("rpc/church_limits", { method: "POST", body: { target: churchId } }), churchLibrary.rest<{ version: string; status: string }[]>(`bible_access_requests?select=version,status&church_id=eq.${churchId}`)])
            plan = limits?.[0]?.plan || "free"
            requests = Object.fromEntries((rows || []).map((r) => [r.version, r.status]))
        } catch {
            // shown as the free plan; downloads of public-domain versions still work
        }
    })

    let progress: { [code: string]: number } = {}
    let messages: { [code: string]: string } = {}

    async function download(version: ScripturalVersion) {
        progress[version.code] = 0
        delete messages[version.code]
        try {
            await downloadVersion(version, (fraction) => (progress[version.code] = fraction))
            const id = downloadedId(version.code)
            if (id) setActiveScripture(id)
        } catch (err) {
            messages[version.code] = err instanceof ScripturalError ? err.message : "The download stopped. Try again."
        }
        delete progress[version.code]
        progress = progress
        messages = messages
    }

    async function ask(version: ScripturalVersion) {
        try {
            const { data } = await churchLibrary.rest<string>("rpc/request_bible_access", { method: "POST", body: { target: churchId, version_code: version.code } })
            requests[version.code] = data || "pending"
        } catch (err) {
            messages[version.code] = err instanceof ScripturalError ? err.message : "The request could not be sent."
            messages = messages
        }
    }

    let search = ""
    $: query = search.trim().toLowerCase()
    const order = (v: ScripturalVersion) => `${v.licensed ? 1 : 0}${v.language === "English" ? "" : v.language}`
    $: shown = SCRIPTURAL_VERSIONS.filter((v) => !query || `${v.name} ${v.code} ${v.language}`.toLowerCase().includes(query)).sort((a, b) => order(a).localeCompare(order(b)))
    $: downloaded = Object.fromEntries(SCRIPTURAL_VERSIONS.map((v) => [v.code, !!Object.values($scriptures).find((s: any) => s?.scripturalVersion === v.code)]))
</script>

<p class="muted">Download a version once and it works offline. Free versions download now; the NIV, NKJV and other licensed versions come with a Church plan, once approved.</p>

<MaterialTextInput label="Search versions" value={search} on:input={(e) => (search = e.detail)} />

<ul>
    {#each shown as version (version.code)}
        <li>
            <div class="name">
                <span>{version.name}</span>
                <span class="muted">{version.code}, {version.language}{version.licensed ? ", licensed" : ""}</span>
                {#if messages[version.code]}<span class="note">{messages[version.code]}</span>{/if}
            </div>

            {#if progress[version.code] !== undefined}
                <span class="muted">{Math.round(progress[version.code] * 100)}%</span>
            {:else if !version.licensed || requests[version.code] === "granted"}
                <MaterialButton variant="outlined" small on:click={() => download(version)}>{downloaded[version.code] ? "Update" : "Download"}</MaterialButton>
            {:else if !signedIn || plan === "free"}
                <span class="muted">Needs a Church plan</span>
            {:else if requests[version.code] === "pending"}
                <span class="muted">Asked, waiting for approval</span>
            {:else}
                <MaterialButton variant="outlined" small on:click={() => ask(version)}>Ask for it</MaterialButton>
            {/if}
        </li>
    {/each}
</ul>

<style>
    p {
        margin: 0 0 12px;
    }
    .muted {
        opacity: 0.7;
        font-size: 0.9em;
    }
    .note {
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
