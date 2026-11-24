// The platform owner's dashboard. It holds no power of its own: every list and every
// change is a database function that first asks is_platform_admin(), so this page in a
// stranger's hands shows nothing. Sign-in lasts as long as the tab.
const PROJECT = "https://gsrpimdgxepoydbrdlqx.supabase.co"
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcnBpbWRneGVwb3lkYnJkbHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTQxNzIsImV4cCI6MjEwNDAzMDE3Mn0.SFxJPiJaVUx9hM0BEx8BC6tKUbvAymtNTljN2bcvmTw"
const SESSION = "platform-admin-session"
const VERIFIER = "platform-admin-verifier"
const PLANS = { free: "Free", church: "Church", multi_campus: "Multi-campus" }
const ROLES = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer", none: "Remove from church" }
const PAGE = 50

const main = document.getElementById("main")

// Everything on the page is built here as text: names and emails come from other people.
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("on")) node.addEventListener(key.slice(2), value)
        else if (key in node) node[key] = value
        else node.setAttribute(key, value)
    }
    node.append(...children.flat().filter((child) => child !== null && child !== undefined))
    return node
}

let toastTimer
function say(text, bad = false) {
    const toast = document.getElementById("toast")
    toast.textContent = text
    toast.className = bad ? "bad" : ""
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.hidden = true), 5000)
}

// SIGN IN //

const readSession = () => JSON.parse(sessionStorage.getItem(SESSION) || "null")
function keepSession(data) {
    sessionStorage.setItem(SESSION, JSON.stringify({ access: data.access_token, refresh: data.refresh_token, until: Date.now() + (data.expires_in || 3600) * 1000, email: data.user?.email || readSession()?.email || "" }))
}

async function auth(path, body) {
    const response = await fetch(`${PROJECT}/auth/v1${path}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.msg || data.error_description || "That did not work. Try again.")
    return data
}

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

async function withGoogle() {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
    sessionStorage.setItem(VERIFIER, verifier)
    const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
    location.assign(`${PROJECT}/auth/v1/authorize?${new URLSearchParams({ provider: "google", redirect_to: `${location.origin}/admin/`, code_challenge: challenge, code_challenge_method: "s256" })}`)
}

async function token() {
    const session = readSession()
    if (!session) return null
    if (session.until - 60000 > Date.now()) return session.access
    try {
        keepSession(await auth("/token?grant_type=refresh_token", { refresh_token: session.refresh }))
        return readSession().access
    } catch {
        sessionStorage.removeItem(SESSION)
        return null
    }
}

async function rpc(name, body = {}) {
    const access = await token()
    if (!access) {
        showSignIn()
        throw new Error("Your sign-in has ended. Sign in again.")
    }
    const response = await fetch(`${PROJECT}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    if (!response.ok) throw Object.assign(new Error(data?.message || "That did not work. Try again."), { code: data?.code })
    return data
}

function showSignIn(note = "") {
    document.getElementById("tabs").hidden = true
    document.getElementById("sign-out").hidden = true
    document.getElementById("who").textContent = ""
    const email = el("input", { type: "email", placeholder: "Email", autocomplete: "email", "aria-label": "Email" })
    const code = el("input", { placeholder: "Code from the email", inputMode: "numeric", autocomplete: "one-time-code", "aria-label": "Code from the email", hidden: true })
    const send = el("button", {
        textContent: "Send code",
        onclick: async () => {
            send.disabled = true
            try {
                if (code.hidden) {
                    // an admin already has an account; this page never makes one
                    await auth("/otp", { email: email.value.trim(), create_user: false })
                    code.hidden = false
                    send.textContent = "Sign in"
                    code.focus()
                } else {
                    keepSession(await auth("/verify", { type: "email", email: email.value.trim(), token: code.value.trim() }))
                    await start()
                }
            } catch (err) {
                say(err.message, true)
            }
            send.disabled = false
        }
    })
    main.replaceChildren(el("div", { className: "signin" }, el("h1", { textContent: "Sign in" }), el("p", { className: "muted", textContent: note || "For the people who run Scriptural Project." }), el("div", { className: "row" }, el("button", { className: "main", textContent: "Continue with Google", onclick: withGoogle })), el("p", { className: "muted small", textContent: "Or we email you a code." }), el("div", { className: "row" }, email, code, send)))
}

// PIECES //

const number = (value) => Number(value || 0).toLocaleString()
const dollars = (micros) => (Number(micros || 0) / 1e6).toLocaleString(undefined, { style: "currency", currency: "USD" })
const day = (value) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Never")

function table(heads, rows, empty) {
    if (!rows.length) return el("p", { className: "muted", textContent: empty })
    return el("div", { className: "table" }, el("table", {}, el("thead", {}, el("tr", {}, heads.map((head) => el("th", { textContent: head, scope: "col" })))), el("tbody", {}, rows)))
}
const cell = (content, className = "") => el("td", { className }, content instanceof Node ? content : String(content ?? ""))

// does it, says so, and shows the list as it is now; a refusal puts the control back
async function change(call, done, reload) {
    try {
        await call()
        say(done)
    } catch (err) {
        say(err.message, true)
    }
    await reload()
}

function picker(options, value, label, pick) {
    const select = el("select", { "aria-label": label, onchange: () => pick(select.value) }, Object.entries(options).map(([key, text]) => el("option", { value: key, textContent: text, selected: key === value })))
    return select
}

// A form over the page. "send" does the work and returns what to say; a refusal is shown
// in the form, which stays open with what was typed.
function ask(title, note, fields, action, send, reload) {
    const bad = el("p", { className: "bad", role: "alert", hidden: true })
    const go = el("button", { className: "main", type: "submit", textContent: action })
    const form = el("form", { method: "dialog" }, el("h2", { textContent: title }), el("p", { className: "muted", textContent: note }), fields.map(([label, field]) => el("label", {}, el("span", { className: "muted small", textContent: label }), field)), bad, el("div", { className: "row" }, el("button", { type: "button", textContent: "Cancel", onclick: () => box.close() }), go))
    const box = el("dialog", { "aria-label": title, onclose: () => box.remove() }, form)
    form.addEventListener("submit", async (event) => {
        event.preventDefault()
        go.disabled = true
        bad.hidden = true
        try {
            const done = await send()
            box.close()
            say(done)
            await reload()
        } catch (err) {
            // an ended sign-in puts the sign-in form on the page, which the dialog would cover
            if (!readSession()) {
                box.close()
                return say(err.message, true)
            }
            bad.textContent = err.message
            bad.hidden = false
        }
        go.disabled = false
    })
    document.body.append(box)
    box.showModal()
}

const emailField = (value = "") => el("input", { type: "email", required: true, autocomplete: "off", value, readOnly: !!value })

async function churchField() {
    const select = el("select", { required: true })
    const options = (rows) => select.replaceChildren(el("option", { value: "", textContent: "Choose a church" }), ...rows.map((church) => el("option", { value: church.id, textContent: church.owner ? `${church.name} (${church.owner})` : church.name })))
    const find = (search) => rpc("platform_churches", { search, page_size: 200, page_offset: 0 })
    const rows = await find("")
    options(rows)
    if (Number(rows[0]?.total || 0) <= rows.length) return [["Church", select]]
    // more than one list holds
    let timer
    let latest = 0
    const search = el("input", {
        type: "search",
        oninput: () => {
            clearTimeout(timer)
            timer = setTimeout(async () => {
                const mine = ++latest
                try {
                    const found = await find(search.value)
                    if (mine === latest) options(found)
                } catch (err) {
                    say(err.message, true)
                }
            }, 250)
        }
    })
    return [["Find a church", search], ["Church", select]]
}

const addPerson = (target, email, role) => rpc("platform_add_person", { target, person_email: email, new_role: role })
const givePlan = (email, plan) => rpc("platform_give_plan", { person_email: email, new_plan: plan })
const placed = (answer, email) => (answer === "added" ? `${email} is in.` : `${email} joins when they first sign in.`)
const planned = (answer, email) => (answer === "given" ? `${email}'s church has the plan now.` : `Their church gets the plan when ${email} has one.`)

// for one person, for one church, or for neither yet
async function askAdd(reload, { email, church } = {}) {
    try {
        const person = emailField(email)
        const places = church ? [] : await churchField()
        const role = picker({ owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" }, "editor", "Role", () => null)
        ask(church ? `Add to ${church.name}` : "Add to a church", "No account yet? They join when they first sign in with this email. We don't email them.", [["Email", person], ...places, ["Role", role]], "Add", async () => placed(await addPerson(church ? church.id : places.at(-1)[1].value, person.value, role.value), person.value.trim()), reload)
    } catch (err) {
        say(err.message, true)
    }
}

function askPlan(reload) {
    const person = emailField()
    const plan = picker({ church: "Church", multi_campus: "Multi-campus" }, "church", "Plan", () => null)
    ask("Give a free plan", "It goes to the church they own. New people get it when they sign in and make one. We don't email them.", [["Email", person], ["Plan", plan]], "Give plan", async () => planned(await givePlan(person.value, plan.value), person.value.trim()), reload)
}

// who was added or given a plan and has not got it yet
async function waitingList(reload) {
    const rows = await rpc("platform_waiting")
    if (!rows.length) return []
    const why = (row) => (!row.has_account ? "Has not signed in" : row.plan ? "Has no church on the free plan yet" : "Signed in, but not added")
    return [
        el("h2", { textContent: "Waiting" }),
        table(
            ["Email", "Gets", "Why it waits", "Since", ""],
            rows.map((row) =>
                el(
                    "tr",
                    {},
                    cell(row.email),
                    cell(row.plan ? `${PLANS[row.plan]} plan` : `${ROLES[row.role]} in ${row.church}`),
                    cell(why(row)),
                    cell(day(row.created_at)),
                    cell(
                        el(
                            "div",
                            { className: "row tight" },
                            row.has_account && row.church_id ? el("button", { textContent: "Try again", onclick: () => change(() => addPerson(row.church_id, row.email, row.role), "Added.", reload) }) : null,
                            el("button", {
                                textContent: "Cancel",
                                "aria-label": `Cancel for ${row.email}`,
                                onclick: () => confirm(`Cancel this for ${row.email}?`) && change(() => rpc("platform_cancel_waiting", { target: row.id }), "Cancelled.", reload)
                            })
                        )
                    )
                )
            ),
            ""
        )
    ]
}

function searchable(title, placeholder, fn, heads, row, empty, { actions = () => [], below = async () => [] } = {}) {
    let offset = 0
    let timer
    const box = el("input", {
        type: "search",
        placeholder,
        "aria-label": placeholder,
        oninput: () => {
            clearTimeout(timer)
            timer = setTimeout(() => ((offset = 0), load()), 250)
        }
    })
    const list = el("div")
    const extra = el("div")
    const count = el("span", { className: "muted" })
    const back = el("button", { textContent: "Back", onclick: () => ((offset -= PAGE), load()) })
    const next = el("button", { textContent: "Next", onclick: () => ((offset += PAGE), load()) })
    let latest = 0
    async function load() {
        const mine = ++latest
        try {
            const rows = await rpc(fn, { search: box.value, page_size: PAGE, page_offset: offset })
            // a slower answer to an earlier search
            if (mine !== latest) return
            const total = Number(rows[0]?.total || 0)
            count.textContent = total ? `${offset + 1} to ${offset + rows.length} of ${number(total)}` : ""
            back.hidden = offset === 0
            next.hidden = offset + rows.length >= total
            list.replaceChildren(table(heads, rows.map((item) => row(item, reload)), empty))
        } catch (err) {
            say(err.message, true)
        }
    }
    async function rest() {
        try {
            extra.replaceChildren(...(await below(reload)))
        } catch (err) {
            say(err.message, true)
        }
    }
    const reload = () => Promise.all([load(), rest()])
    main.replaceChildren(el("div", { className: "row head" }, el("h1", { textContent: title }), el("div", { className: "row tight" }, actions(reload))), el("div", { className: "row" }, box, count, el("span", { className: "grow" }), back, next), list, extra)
    return reload()
}

// SECTIONS //

async function overview() {
    const data = await rpc("platform_overview")
    const stats = [
        ["People", number(data.users)],
        ["Joined in 30 days", number(data.new_users)],
        ["Signed in, 30 days", number(data.active_users)],
        ["Churches", number(data.churches)],
        ["Paying", number(data.paying)],
        ["Free by us", number(data.comped)],
        ["Payment late", number(data.past_due)],
        ["Songs", number(data.songs)],
        ["AI requests this month", number(data.ai_requests)],
        ["Claude cost this month", dollars(data.ai_cost_micros)],
        ["Bible requests waiting", number(data.bible_requests)]
    ]
    main.replaceChildren(el("h1", { textContent: "Overview" }), el("div", { className: "stats" }, stats.map(([label, value]) => el("div", { className: "stat" }, el("b", { textContent: value }), el("span", { className: "muted", textContent: label })))))
}

const users = () =>
    searchable(
        "People",
        "Search by email or church",
        "platform_users",
        ["Email", "Signs in with", "Joined", "Last seen", "Churches", ""],
        (user, reload) =>
            el(
                "tr",
                {},
                cell(el("span", {}, user.email, user.suspended ? el("span", { className: "bad", textContent: " (suspended)" }) : null, user.is_admin ? el("span", { className: "muted", textContent: " (platform admin)" }) : null)),
                cell(user.provider === "google" ? "Google" : "Email code"),
                cell(day(user.created_at)),
                cell(day(user.last_sign_in_at)),
                cell(
                    el(
                        "div",
                        {},
                        user.churches.length
                            ? user.churches.map((church) =>
                                  el(
                                      "div",
                                      { className: "row tight" },
                                      church.name,
                                      picker(ROLES, church.role, `Role in ${church.name}`, (role) => {
                                          if (role === "none" && !confirm(`Remove ${user.email} from ${church.name}?`)) return reload()
                                          return change(() => rpc("platform_set_role", { target: church.id, person: user.id, new_role: role }), "Saved.", reload)
                                      })
                                  )
                              )
                            : el("span", { className: "muted", textContent: "None yet" })
                    )
                ),
                cell(
                    el(
                        "div",
                        { className: "row tight" },
                        el("button", { textContent: "Add to a church", "aria-label": `Add ${user.email} to a church`, onclick: () => askAdd(reload, { email: user.email }) }),
                        user.is_admin
                            ? null
                            : el("button", {
                                  textContent: user.suspended ? "Let back in" : "Suspend",
                                  onclick: () => {
                                      if (!user.suspended && !confirm(`Suspend ${user.email}? They are signed out everywhere and can't sign in. Nothing of theirs is deleted.`)) return
                                      return change(() => rpc("platform_set_suspended", { person: user.id, suspended: !user.suspended }), user.suspended ? "They can sign in again." : "Suspended.", reload)
                                  }
                              })
                    )
                )
            ),
        "No one matches that.",
        {
            actions: (reload) => [el("button", { textContent: "Give a free plan", onclick: () => askPlan(reload) }), el("button", { className: "main", textContent: "Add person", onclick: () => askAdd(reload) })],
            below: waitingList
        }
    )

const churches = () =>
    searchable(
        "Churches",
        "Search by name",
        "platform_churches",
        ["Church", "Owner", "People", "Songs", "Plan", "AI this month", "Licensed Bibles", ""],
        (church, reload) =>
            el(
                "tr",
                {},
                cell(el("div", {}, church.name, el("div", { className: "muted small", textContent: `Since ${day(church.created_at)}` }))),
                cell(church.owner || "No owner"),
                cell(number(church.members), "num"),
                cell(number(church.songs), "num"),
                cell(church.billed ? el("span", { className: church.status === "past_due" ? "bad" : "", textContent: `${PLANS[church.plan]}, ${church.status === "past_due" ? "payment late" : "paid by Stripe"}` }) : picker(PLANS, church.plan, `Plan of ${church.name}`, (plan) => change(() => rpc("platform_set_plan", { target: church.id, new_plan: plan }), "Plan saved.", reload))),
                cell(`${number(church.ai_requests)}, ${dollars(church.ai_cost_micros)}`, "num"),
                cell(picker({ ask: "Ask each time", grant: "Grant at once" }, church.auto_grant ? "grant" : "ask", `Licensed Bibles for ${church.name}`, (value) => change(() => rpc("platform_set_auto_grant", { target: church.id, allowed: value === "grant" }), "Saved.", reload))),
                cell(el("button", { textContent: "Add person", "aria-label": `Add a person to ${church.name}`, onclick: () => askAdd(reload, { church }) }))
            ),
        "No church matches that."
    )

async function bibles() {
    const rows = await rpc("platform_bible_access_queue")
    const decide = (row, decision) => change(() => rpc("platform_decide_bible_access", { target: row.church_id, version_code: row.version, decision }), decision === "granted" ? "Granted." : "Declined.", bibles)
    main.replaceChildren(
        el("h1", { textContent: "Bible requests" }),
        table(
            ["Church", "Version", "Asked", ""],
            rows.map((row) => el("tr", {}, cell(row.church_name), cell(row.version), cell(day(row.requested_at)), cell(el("div", { className: "row tight" }, el("button", { textContent: "Grant", onclick: () => decide(row, "granted") }), el("button", { textContent: "Decline", onclick: () => decide(row, "declined") }))))),
            "No one is waiting."
        )
    )
}

const ACTIONS = { set_plan: "Changed the plan", set_auto_grant: "Changed licensed Bibles", set_role: "Changed a role", set_suspended: "Suspended or let back in", add_person: "Added to a church", invite_person: "Added, waiting for sign-in", give_plan: "Gave a free plan", promise_plan: "Promised a free plan", cancel_waiting: "Cancelled a wait" }
async function activity() {
    const rows = await rpc("platform_log")
    main.replaceChildren(
        el("h1", { textContent: "Activity" }),
        table(
            ["When", "Admin", "What", "Church", "Person", "To"],
            rows.map((row) => el("tr", {}, cell(new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })), cell(row.admin), cell(ACTIONS[row.action] || row.action), cell(row.church), cell(row.person), cell(Object.values(row.detail || {}).map((value) => PLANS[value] || ROLES[value] || (value === true ? "On" : value === false ? "Off" : value)).join(", ")))),
            "Nothing has been changed from here yet."
        )
    )
}

// SHELL //

const SECTIONS = { overview: ["Overview", overview], people: ["People", users], churches: ["Churches", churches], bibles: ["Bible requests", bibles], activity: ["Activity", activity] }

async function open(id) {
    const key = SECTIONS[id] ? id : "overview"
    document.getElementById("tabs").replaceChildren(...Object.entries(SECTIONS).map(([name, [label]]) => el("button", { textContent: label, "aria-current": name === key ? "page" : "false", onclick: () => (location.hash = name) })))
    try {
        await SECTIONS[key][1]()
    } catch (err) {
        if (err.code === "42501") {
            sessionStorage.removeItem(SESSION)
            showSignIn("That account is not a platform admin.")
        } else say(err.message, true)
    }
}

async function start() {
    const session = readSession()
    if (!session) return showSignIn()
    document.getElementById("who").textContent = session.email
    document.getElementById("sign-out").hidden = false
    document.getElementById("tabs").hidden = false
    await open(location.hash.slice(1))
}

document.getElementById("sign-out").addEventListener("click", async () => {
    const session = readSession()
    sessionStorage.removeItem(SESSION)
    showSignIn()
    if (session) await fetch(`${PROJECT}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${session.access}` } }).catch(() => null)
})
addEventListener("hashchange", () => readSession() && open(location.hash.slice(1)))

const code = new URLSearchParams(location.search).get("code")
const verifier = sessionStorage.getItem(VERIFIER)
if (code) history.replaceState(null, "", location.pathname + location.hash)
sessionStorage.removeItem(VERIFIER)
if (code && verifier) {
    try {
        keepSession(await auth("/token?grant_type=pkce", { auth_code: code, code_verifier: verifier }))
    } catch (err) {
        say(err.message, true)
    }
}
start()
