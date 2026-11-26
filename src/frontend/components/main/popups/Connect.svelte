<script lang="ts">
    import { GUIDE_URL } from "../../../../types/links"
    import qrcode from "qrcode-generator"
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { AudioAnalyser } from "../../../audio/audioAnalyser"
    import { sendMain } from "../../../IPC/main"
    import { activePopup, maxConnections, os, outputs, popupData, ports, serverData, special } from "../../../stores"
    import { clone, keysToID, sortByName } from "../../helpers/array"
    import Icon from "../../helpers/Icon.svelte"
    import T from "../../helpers/T.svelte"
    import Link from "../../inputs/Link.svelte"
    import { newToast } from "../../../utils/common"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialDropdown from "../../inputs/MaterialDropdown.svelte"
    import MaterialNumberInput from "../../inputs/MaterialNumberInput.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import MaterialToggleSwitch from "../../inputs/MaterialToggleSwitch.svelte"
    import { startRemoteController, stopRemoteController } from "../../../utils/remoteController"
    import Tip from "../Tip.svelte"

    let id: keyof typeof defaultPorts = "stage"
    let ip = "localhost"

    let remoteController = $popupData.remoteController
    let controllerId = $special.remoteControllerId
    if (!controllerId) setRemoteId()
    function setRemoteId() {
        if (controllerId) stopRemoteController(controllerId)

        // a string of 6 random characters
        let id = Math.random().toString(36).substring(2, 8)
        controllerId = id
        special.update((a) => ({ ...a, remoteControllerId: id }))

        startRemoteController(id)
    }

    $: useHostname = $special.connectionHostname

    onMount(() => {
        id = $popupData.id
        ip = $popupData.ip
        popupData.set({})
    })

    const defaultPorts = {
        remote: 5510,
        stage: 5511,
        controller: 5512,
        output_stream: 5513,

        companion: 5505,
        agents: 5507
        // rest: 5506

        // PCO: 5501
    }

    $: port = $ports[id] || defaultPorts[id]
    $: hostname = `${$os.name.toLowerCase()}${$os.platform === "win32" ? ".local" : ""}`
    $: url = remoteController ? `https://freeshow.net/control?id=${controllerId}` : `http://${useHostname ? hostname : ip}:${port}`
    $: if (url) generateQR(url)

    function mouseup(e: any) {
        if (e.target.closest("a")) activePopup.set(null)
    }

    let qrImg = ""
    function generateQR(text) {
        if (remoteController ? !controllerId : (!useHostname && ip === "localhost") || id === "companion" || id === "agents") return

        var qr = qrcode(0, "L")
        qr.addData(text)
        qr.make()
        qrImg = qr.createImgTag(8, 8)
    }

    let options = false

    $: agentToken = $serverData?.agents?.password || ""
    $: agentCommand = `claude mcp add --transport http scriptural-project http://127.0.0.1:5507/mcp --header "Authorization: Bearer ${agentToken}"`
    function copyAgent(value: string) {
        navigator.clipboard.writeText(value)
        newToast("actions.copied")
    }
    function replaceAgentToken() {
        const password = Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, "0")).join("")
        serverData.update((a) => ({ ...a, agents: { ...a.agents, password } }))
        sendMain(Main.AGENT_SERVER, { enabled: true, token: password })
        newToast("Connect your agents again with the new command.")
    }

    const RESERVED_PORTS = { nowPlaying: [5502], WebSocket: [5505], REST: [5506], companion: [5505, 5506], remote: [5510], stage: [5511], controller: [5512], output_stream: [5513], agents: [5507] }
    $: isReserved = !RESERVED_PORTS[id]?.includes(port) && Object.values(RESERVED_PORTS).flat().includes(port)

    function updatePort(e: any) {
        port = e.detail
        ports.update((a) => {
            a[id] = port
            return a
        })

        if (id === "companion") restartCompanion()
    }

    function restartCompanion() {
        if (!$serverData?.companion?.enabled) return
        sendMain(Main.WEBSOCKET_START, { port: $ports.companion || 5505, password: $serverData?.companion?.password })
    }

    // output
    $: outputsList = getList(clone($outputs))
    function getList(outputs) {
        let list = keysToID(outputs).filter((a) => a.enabled === true)
        return sortByName(list).map((a) => ({ label: a.name, value: a.id }))
    }

    function toggleAudio(e: any) {
        let value = e.detail
        updateData(value, "sendAudio")
        if (value) AudioAnalyser.recorderActivate()
    }

    function updateData(e: any, key: string) {
        let value = e.detail ?? e

        serverData.update((a) => {
            if (!a[id]) a[id] = {}
            a[id][key] = value

            return a
        })

        sendMain(Main.SERVER_DATA, $serverData)

        if (id === "companion" && key === "password") restartCompanion()
    }

    function updateSpecial(key: string, value: any) {
        special.update((a) => {
            a[key] = value
            return a
        })
    }

    // $: enableOutputSelector = ($serverData?.output_stream?.outputId && $outputs[$serverData.output_stream.outputId]) || getActiveOutputs($outputs, false, true).length > 1
</script>

{#if id === "agents"}
    <div style="text-align: start;max-width: 560px;">
        <p style="white-space: initial;margin-bottom: 10px;">An AI agent on this computer can find scripture, build plans, see the screen and run it. Paste this in a terminal to connect Claude Code:</p>
        <code class="command">{agentCommand.replace(agentToken, "••••••••")}</code>
        <div style="display: flex;justify-content: flex-end;gap: 6px;margin-top: 10px;">
            <MaterialButton variant="outlined" icon="reset" on:click={replaceAgentToken}>New token</MaterialButton>
            <MaterialButton variant="outlined" icon="copy" on:click={() => copyAgent(agentCommand)}>Copy command</MaterialButton>
        </div>
        <p style="white-space: initial;margin-top: 10px;opacity: 0.7;">For another agent: address http://127.0.0.1:5507/mcp, with the token as a Bearer header. The token is part of the command, so keep it to yourself.</p>
    </div>
{:else if remoteController}
    <MaterialButton class="popup-options" icon="reset" iconSize={1.1} title="actions.reset" on:click={() => setRemoteId()} white />
{:else}
    <MaterialButton class="popup-options {options ? 'active' : ''}" icon="options" iconSize={1.3} title={options ? "actions.close" : "create_show.more_options"} on:click={() => (options = !options)} white />

    <MaterialButton class="popup-reset" icon="help" iconSize={1.1} title="titlebar.help" on:click={() => sendMain(Main.URL, GUIDE_URL)} white />
{/if}

{#if id === "agents"}
    <!-- shown above -->
{:else if options}
    <div class="reserved" class:isReserved>
        <MaterialNumberInput label="settings.port" value={port} defaultValue={RESERVED_PORTS[id]?.[0]} min={1025} max={65535} on:change={(e) => updatePort(e)} />
    </div>

    {#if id === "remote"}
        <MaterialTextInput label="remote.password" value={$serverData?.remote?.password || ""} on:change={(e) => updateData(e.detail || "", "password")} />
    {:else if id === "companion"}
        <MaterialTextInput label="remote.password" value={$serverData?.companion?.password || ""} on:change={(e) => updateData(e.detail || "", "password")} />
    {:else if id === "output_stream"}
        <!-- {#if enableOutputSelector} -->
        <MaterialDropdown label="midi.output" options={outputsList} value={$serverData?.output_stream?.outputId || ""} on:change={(e) => updateData(e.detail, "outputId")} allowEmpty />
        <!-- {/if} -->

        <!-- WIP disable for now until it's working again -->
        {#if $serverData?.output_stream?.sendAudio}
            <MaterialToggleSwitch label="preview.audio" checked={$serverData?.output_stream?.sendAudio} defaultValue={false} on:change={toggleAudio} />
        {/if}
    {/if}

    {#if id !== "companion"}
        <hr />

        <MaterialNumberInput label="settings.max_connections" value={$maxConnections} max={100} on:change={(e) => maxConnections.set(e.detail)} />
        <MaterialToggleSwitch label="settings.use_hostname" checked={$special.connectionHostname} defaultValue={false} on:change={(e) => updateSpecial("connectionHostname", e.detail)} />
    {/if}
{:else}
    <div on:mouseup={mouseup}>
        {#if id === "companion"}
            <Link url={GUIDE_URL}>
                Bitfocus Companion Connection
                <Icon id="launch" white />
            </Link>
        {:else}
            <p><T id="settings.connect" />:</p>
            <Link {url}>
                {url}
                <Icon id="launch" white />
            </Link>

            <br />

            {#if ip === "localhost"}
                <p style="text-align: start;">
                    <T id="error.ip" />
                    <!-- <br />Should look similar to this: 192.168.1.100 -->
                </p>
            {:else if qrImg}
                <p style="margin-bottom: 5px;"><T id="settings.connect_qr" />:</p>
                {@html qrImg}
            {/if}
        {/if}

        {#if id === "remote" && $serverData?.remote?.password}
            <p style="padding-top: 10px;font-size: 0.9em;"><T id="remote.password" />: <b>{$serverData.remote.password}</b></p>
        {:else if id === "companion" && $serverData?.companion?.password}
            <p style="padding-top: 10px;font-size: 0.9em;"><T id="remote.password" />: <b>{$serverData.companion.password}</b></p>
        {:else if remoteController}
            <Tip value="With this you don't need to connect to the same router." top={15} />
        {/if}
    </div>
{/if}

<style>
    div {
        text-align: center;
    }

    div :global(a) {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    hr {
        border: none;
        height: 2px;
        margin: 20px 0;
        background-color: var(--primary-lighter);
    }

    div :global(img) {
        border-radius: var(--radius-sm);
    }

    .command {
        display: block;
        padding: 10px;
        border-radius: var(--radius-sm);
        background-color: var(--primary-darkest);
        white-space: pre-wrap;
        word-break: break-all;
        user-select: text;
    }

    .reserved.isReserved :global(input) {
        color: #ff3232;
    }
</style>
