// From https://github.com/simonw/til/blob/main/electron/sign-notarize-electron-macos.md
// Based on https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/

const { notarize } = require("@electron/notarize")

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context
    if (electronPlatformName !== "darwin") return
    // unsigned builds (no Apple credentials in the environment) skip notarizing.
    // An App Store Connect API key (APPLE_API_KEY = path to the .p8) notarizes
    // without an Apple ID app-specific password; the Apple ID path stays for CI.
    const appName = context.packager.appInfo.productFilename
    const appPath = `${appOutDir}/${appName}.app`
    const appBundleId = "online.scriptural.project"

    if (process.env.APPLE_API_KEY) {
        return await notarize({
            appBundleId,
            appPath,
            appleApiKey: process.env.APPLE_API_KEY,
            appleApiKeyId: process.env.APPLE_API_KEY_ID,
            appleApiIssuer: process.env.APPLE_API_ISSUER
        })
    }
    if (!process.env.APPLE_ID) return

    return await notarize({
        appBundleId,
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
    })
}
