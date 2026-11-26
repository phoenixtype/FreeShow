<script lang="ts">
    import type { CustomBibleListContent } from "json-bible/lib/api/ApiBible"
    import { uid } from "uid"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain, sendMain } from "../../../IPC/main"
    import { addAncientWritings } from "../../../scriptural/ancientWritings"
    import { dictionary, scriptures, popupData } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { replace } from "../../../utils/languageData"
    import { customBibleData, getApiBiblesList } from "../../drawer/bible/scripture"
    import { clone, sortByName } from "../../helpers/array"
    import T from "../../helpers/T.svelte"
    import HRule from "../../input/HRule.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialCheckbox from "../../inputs/MaterialCheckbox.svelte"
    import MaterialMultiChoice from "../../inputs/MaterialMultiChoice.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import Center from "../../system/Center.svelte"
    import Loader from "../Loader.svelte"
    import ScripturalBibles from "./ScripturalBibles.svelte"

    let bibles: CustomBibleListContent[] = []
    let recommended: CustomBibleListContent[] = []
    let error: null | string = null

    $: if (importType === "api") loadApiBibles()
    async function loadApiBibles() {
        try {
            let bibleList = await getApiBiblesList()
            bibleList = bibleList.map((a) => {
                const bible = customBibleData(a)
                if (bible.description && (bible.description.toLowerCase() === "common" || bible.description === "Holy Bible" || bible.name.includes(bible.description))) bible.description = ""
                return bible
            })

            // get list of bibles in language
            let langCode = window.navigator.language.slice(-2).toLowerCase()
            // if it needs attribution, it's probably more in demand!
            bibleList = sortByName(bibleList).sort((a, b) => ((b.attributionRequired || b.attributionString) as any) - ((a.attributionRequired || a.attributionString) as any))
            let newSorted: any[] = []
            bibleList.forEach((bible) => {
                let lang = bible.language
                if (lang === "nob" || lang === "nor" || lang === "nno") lang = "no"

                newSorted.push(bible)
                let match = false
                // eng <> en
                if (lang.includes(langCode)) match = true
                else {
                    langCode = replace[langCode] ? langCode : Object.entries(replace).find(([_id, r]) => r.includes(langCode))?.[0] || ""
                    if (lang.includes(langCode)) match = true
                }

                if (match) {
                    recommended.push({ ...bible, name: bible.nameLocal || bible.name, description: bible.nameLocal ? bible.name : bible.description })
                    newSorted.pop()
                }
            })
            bibles = newSorted
            recommended = recommended
        } catch (err) {
            error = err
        }
    }

    let searchedBibles: CustomBibleListContent[] = []
    let searchedRecommendedBibles: CustomBibleListContent[] = []
    $: searchedBibles = bibles
    $: searchedRecommendedBibles = clone(recommended)

    function toggleScripture(bible: CustomBibleListContent) {
        scriptures.update((a) => {
            const id = bible.sourceKey
            const existingId = Object.entries(a).find(([_key, value]: any) => value.id === id)?.[0]

            if (existingId) delete a[existingId]
            else a[uid()] = { name: bible.name, api: true, id, metadata: { copyright: bible.copyright }, attributionRequired: bible.attributionRequired, attributionString: bible.attributionString }

            return a
        })
    }

    function search(e: any) {
        let value = e.detail.toLowerCase()

        if (value.length < 2) {
            searchedBibles = bibles
            searchedRecommendedBibles = clone(recommended)
            return
        }

        searchedBibles = bibles.filter((a) => value.split(" ").find((value) => a.name.toLowerCase().includes(value)))
        searchedRecommendedBibles = clone(recommended).filter((a) => value.split(" ").find((value) => a.name.toLowerCase().includes(value)))
    }

    // the home checklist opens straight on Scriptural's versions
    let importType = $popupData?.importType || ""
    const importTypes = [
        { id: "scriptural", name: "Scriptural", icon: "scripture" },
        { id: "api", name: "API", icon: "web" }, // translate | scripture_alt
        { id: "local", name: translateText("cloud.local"), icon: "folder" } // scripture
    ]

    // shipped with the app: added only when asked for
    $: hasAncient = Object.values($scriptures).some((a) => a.ancientWritings)
    let ancientError = ""
    async function addAncient() {
        ancientError = ""
        try {
            await addAncientWritings()
        } catch (err) {
            console.warn("Other ancient writings could not be added:", err)
            ancientError = translateText("account.ancient_failed")
        }
    }

    let localBibles: { path: string; name: string }[] = []
    $: if (importType === "local") getLocalBibles()
    async function getLocalBibles() {
        localBibles = (await requestMain(Main.READ_BIBLES_FOLDER)) || []
        const existingBibles = Object.values($scriptures).map((a) => a.name.replace(/\.fsb$/i, ""))
        console.log(localBibles, existingBibles, $scriptures)
        // remove already existing
        localBibles = localBibles.filter((a) => !existingBibles.includes(a.name))
    }
    function importBible(path: string) {
        sendMain(Main.IMPORT_FILES, { id: "BIBLE", paths: [path] })
    }
</script>

{#if importType}
    <MaterialButton class="popup-back" icon="back" iconSize={1.3} title="actions.back" on:click={() => (importType = "")} />
{/if}

{#if importType === "scriptural"}
    <ScripturalBibles />
{:else if importType === "api"}
    {#if error}
        <T id="error.bible_api" />
    {:else}
        <div class="info">
            {translateText("captions.powered_by")} API.Bible & YouVersion
        </div>

        <MaterialTextInput label="main.search" id="scriptureApiSearchInput" value="" on:input={search} autofocus />

        <div class="list">
            {#if searchedRecommendedBibles.length}
                {#each searchedRecommendedBibles as bible}
                    <MaterialCheckbox label={bible.name} title="{bible.source === 'youversion' ? '[YouVersion] ' : ''}{bible.name}" data={bible.description} style={bible.source === "youversion" ? "border-left: 2px solid #4a3a30;" : bible.source === "api.bible" ? "border-left: 2px solid #253354;" : ""} checked={!!Object.values($scriptures).find((a) => a.id === bible.sourceKey)} on:change={() => toggleScripture(bible)} />
                {/each}

                {#if searchedBibles.length}
                    <hr />
                {/if}
            {/if}

            {#if bibles.length}
                {#if searchedBibles.length}
                    {#each searchedBibles as bible}
                        <MaterialCheckbox label={bible.name} title="{bible.source === 'youversion' ? '[YouVersion] ' : ''}{bible.name}" data={bible.description} style={bible.source === "youversion" ? "border-left: 2px solid #4a3a30;" : bible.source === "api.bible" ? "border-left: 2px solid #253354;" : ""} checked={!!Object.values($scriptures).find((a) => a.id === bible.sourceKey)} on:change={() => toggleScripture(bible)} />
                    {/each}
                {:else if !searchedRecommendedBibles.length}
                    <Center faded>
                        <T id="empty.search" />
                    </Center>
                {/if}
            {:else}
                <Center>
                    <Loader />
                </Center>
            {/if}
        </div>
    {/if}
{:else if importType === "local"}
    {#if localBibles.length}
        <div class="existingBiblesList">
            {#each localBibles as localBible}
                <MaterialButton variant="outlined" icon="import" style="justify-content: left;" on:click={() => importBible(localBible.path)} white>
                    {localBible.name}
                </MaterialButton>
            {/each}
        </div>

        <HRule />
    {/if}

    <p style="font-size: 1.1em;"><T id="scripture.supported_formats" /></p>
    <ul style="list-style: inside;">
        <li>
            <span style="font-size: 0.9em;font-weight: bold;">XML</span>
            <span style="font-size: 0.8em;opacity: 0.8;margin-left: 10px;">Zefania/OSIS/Beblia/OpenSong</span>
        </li>
        <li>
            <span style="font-size: 0.9em;font-weight: bold;">JSON</span>
            <span style="font-size: 0.8em;opacity: 0.8;margin-left: 10px;">FreeShow (.fsb)</span>
        </li>
    </ul>

    <MaterialButton variant="outlined" icon="import" on:click={() => sendMain(Main.IMPORT, { channel: "BIBLE", format: { name: "Bible", extensions: ["xml", "xmm", "json", "fsb"] } })}>
        <T id="scripture.local" />
    </MaterialButton>
{:else}
    <MaterialMultiChoice options={importTypes} on:click={(e) => (importType = e.detail)} />

    <div class="ancient">
        <div>
            <p><strong><T id="account.ancient_title" /></strong></p>
            <p>{translateText("account.ancient_notice", $dictionary)} {translateText("account.ancient_listening", $dictionary)}</p>
            {#if hasAncient}<p><T id="account.ancient_added" /></p>{/if}
            {#if ancientError}<p>{ancientError}</p>{/if}
        </div>
        {#if !hasAncient}
            <MaterialButton variant="outlined" icon="add" on:click={addAncient}><T id="account.add" /></MaterialButton>
        {/if}
    </div>
{/if}

<style>
    .list {
        display: flex;
        flex-direction: column;
        max-height: 55vh;
        margin-top: 10px;
        overflow: auto;

        background-color: var(--primary-darker);
        border-radius: var(--radius);
        padding: 10px 0;
    }
    /* .list :global(button:nth-child(odd)) {
        background-color: var(--primary-darkest) !important;
    } */

    .list :global(button) {
        justify-content: start;
        font-weight: normal;

        line-height: 1.5em;

        border-radius: 0;
        cursor: pointer;
        padding: 16px 20px;
    }

    hr {
        border: 1px solid var(--primary-lighter);
        margin: 20px 0;
    }

    .info {
        position: absolute;
        right: 40px;
        top: 8px;
        padding: 10px 20px;
        font-size: 0.7em;
        opacity: 0.3;
    }

    .ancient {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin-top: 20px;
        padding-top: 15px;
        border-top: 1px solid var(--primary-lighter);
    }
    .ancient p {
        margin: 0 0 4px;
        white-space: normal;
    }

    .existingBiblesList {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
</style>
