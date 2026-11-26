import { get } from "svelte/store"
import { activePopup, alertUpdates, isDev, popupData, special } from "./../stores"

interface UpdateData {
    latestVersion: string
    changelog: string
    hasUpdate: boolean
}

// "1.10.0" is newer than "1.9.9", and a release is newer than its own beta
export function isNewerVersion(latest: string, current: string) {
    if (!latest) return false
    const [latestNumbers, latestPre = ""] = latest.split(/-(.*)/)
    const [currentNumbers, currentPre = ""] = current.split(/-(.*)/)

    const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
    const numbers = compare(latestNumbers, currentNumbers)
    if (numbers) return numbers > 0
    if (!latestPre || !currentPre) return !latestPre && !!currentPre
    return compare(latestPre, currentPre) > 0
}

export async function getUpdateData(currentVersion: string, includeBeta: boolean): Promise<UpdateData> {
    const response = await fetch("https://api.github.com/repos/phoenixtype/FreeShow/releases")
    // only version tags are app releases: the repository also holds the speech model's files
    const data = (await response.json()).filter((a: any) => /^v\d/.test(a.tag_name || ""))

    const latestAll = data.filter((a: any) => a.draft === false)[0]
    const latestRelease = data.filter((a: any) => a.draft === false && a.prerelease === false)[0]

    const latestVersionAll = latestAll?.tag_name?.slice(1) || ""
    const latestVersionStable = latestRelease?.tag_name?.slice(1) || latestVersionAll
    const latestVersion = includeBeta ? latestVersionAll : latestVersionStable
    const changelog = includeBeta ? latestAll?.body || "" : latestRelease?.body || latestAll?.body || ""

    return {
        latestVersion,
        changelog,
        hasUpdate: isNewerVersion(latestVersion, currentVersion)
    }
}

export function checkForUpdates(currentVersion: string) {
    if (get(isDev) || get(alertUpdates) === false) return
    const includeBeta = currentVersion.includes("-beta") || get(special).betaVersionAlert

    getUpdateData(currentVersion, includeBeta)
        .then(({ latestVersion, changelog, hasUpdate }) => {
            if (get(activePopup) !== null) return
            if (!hasUpdate) return

            popupData.set({ changelog, latestVersion })
            activePopup.set("new_update")
        })
        .catch((error) => {
            console.warn(error)
        })
}
