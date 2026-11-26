// API keys are Scriptural Project's own, written in at build time (scripts/ownKeys.js).
// A name with no key returns "", never another app's key.
import { keysRequired, ownKeys, ownProviders } from "./ownKeys"

export function getKey(type: string) {
    return ownKeys[type] || ""
}

// a production build hides a provider it has no keys of its own for
export function providerAvailable(id: "pixabay" | "unsplash" | "planningcenter" | "churchApps" | "amazinglife") {
    return !keysRequired || ownProviders.includes(id)
}
