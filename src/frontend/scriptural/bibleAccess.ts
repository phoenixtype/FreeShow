/** What a version in the download list offers this computer. The server decides what may actually be downloaded. */
export function bibleAction(version: { licensed?: boolean }, church: { signedIn: boolean; plan: string; request?: string }): "download" | "sign_in" | "see_plans" | "ask" | "waiting" {
    if (!version.licensed || church.request === "granted") return "download"
    if (!church.signedIn) return "sign_in"
    if (church.plan === "free") return "see_plans"
    return church.request === "pending" ? "waiting" : "ask"
}
