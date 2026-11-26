import { os, activePage, activeDrawerTab } from "../stores"
import { get } from "svelte/store"

// Scriptural build: no usage is reported to anyone, and there is no analytics account in the app.
// The calls stay so upstream changes keep merging.
function trackEvent(_eventName: string, _params?: Record<string, any>) {}

export function startTracking() {
    trackEvent("session_start")
    trackAppLaunch()

    // listeners
    activePage.subscribe(trackPageView)
    activeDrawerTab.subscribe(trackDrawerView)
}

function trackAppLaunch() {
    trackEvent("application_start", { platform: get(os).platform })
}

function trackPageView(title: string) {
    trackEvent("page_view", { page_location: "https://freeshow.app/_app/" + title, page_title: title })
}

function trackDrawerView(title: string) {
    trackEvent("drawer_view", { drawer_location: "https://freeshow.app/_app/" + title, drawer_title: title })
}

const previouslyTracked: { [key: string]: string } = {}
export function trackScriptureUsage(translationName: string, apiId: string | null, verseRef: string) {
    if (previouslyTracked[translationName] === verseRef) return
    previouslyTracked[translationName] = verseRef

    trackEvent("scripture_usage", { translation_name: translationName, api_id: apiId, verse_ref: verseRef })
}
