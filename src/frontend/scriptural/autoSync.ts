// The church library syncs only when someone presses Sync, so the server is never hit in
// the background. A save while signed in to a church marks the library as changed, and
// the top bar shows "Sync library" until it is pressed.

import { saved } from "../stores"
import { ACTIVE_CHURCH_KEY } from "./ai"
import { librarySyncPending } from "./churchSync"
import { churchLibrary } from "./connection"

export function markChangedOnSave(isSaved: boolean) {
    if (isSaved && localStorage.getItem(ACTIVE_CHURCH_KEY) && churchLibrary.getSession()) librarySyncPending.set(true)
}

let started = false
export function watchLibraryChanges() {
    if (started) return
    started = true
    // the first value is the state at launch, not a save
    let first = true
    saved.subscribe((isSaved) => {
        if (first) return void (first = false)
        markChangedOnSave(isSaved)
    })
}
