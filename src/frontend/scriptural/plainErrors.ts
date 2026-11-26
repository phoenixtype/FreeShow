// What a volunteer is told when the server says no. The database's own words
// (constraint names, "row-level security") never reach the screen.

// raised by our own database functions, written to be read
const OUR_CODES = ["P0001", "P0002", "22023"]

const byStatus = (status: number) => {
    if (status === 401) return "Your sign-in has ended. Sign in to the church library again."
    if (status === 403) return "Your role in this church does not allow that. Ask the owner or an admin."
    if (status === 429) return "Too many tries at once. Wait a minute and try again."
    if (status >= 500) return "The church library is not answering. Try again in a few minutes."
    return "That did not work. Try again."
}

export function plainRestError(status: number, detail: { code?: string; message?: string } | null): string {
    const message = detail?.message || ""
    if (message && OUR_CODES.includes(detail?.code || "")) return message
    // our functions raise 42501 with a sentence; Postgres raises it with table names
    if (message && detail?.code === "42501" && !/permission denied|row-level security/i.test(message)) return message
    return byStatus(status)
}

export function plainSignInError(status: number): string {
    if (status === 429) return "Too many tries at once. Wait a minute and try again."
    if (status >= 500) return "Sign-in is not answering. Try again in a few minutes."
    return "That did not work. Check the email and code, or ask for a new code."
}
