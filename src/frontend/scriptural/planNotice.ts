// What stands between this church and Scriptural AI, when its plan does.

import { writable } from "svelte/store"

/** why the last request was refused for the plan, or "" */
export const planProblem = writable("")
/** the same words while they are on show: once each time the app runs, until closed */
export const planNotice = writable("")
