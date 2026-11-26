// Shared by every public page: download buttons, and advertising tags behind consent.
;(() => {
    const tags = window.SCRIPTURAL_TAGS || {}
    const CHOICE = "scriptural-consent"
    // US dollars, matching /pricing
    const PRICES = { church_monthly: 19, church_yearly: 190, multi_campus_monthly: 49, multi_campus_yearly: 490 }
    const companies = [(tags.ga4Id || tags.googleAdsId) && "Google", tags.metaPixelId && "Meta", tags.tiktokPixelId && "TikTok"].filter(Boolean)

    const read = (store, key) => {
        try {
            return store.getItem(key)
        } catch {
            return null
        }
    }
    const write = (store, key, value) => {
        try {
            store.setItem(key, value)
        } catch {}
    }

    // downloads: phones get a way to send the link, computers get their own button first
    const ua = navigator.userAgent
    const phone = /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)
    if (phone) document.documentElement.classList.add("phone")
    else {
        const mine = /Windows/.test(ua) ? "windows" : /Mac/.test(ua) ? "mac" : "linux"
        document.querySelectorAll(".downloads a[data-os]").forEach((link) => {
            const own = link.dataset.os === mine
            link.classList.toggle("secondary", !own)
            if (own) link.parentElement.prepend(link)
        })
    }
    document.querySelectorAll(".send-link").forEach((link) =>
        link.addEventListener("click", (event) => {
            if (!navigator.share) return // the mail link does it
            event.preventDefault()
            navigator.share({ title: "Scriptural Project", url: "https://project.scriptural.online/" }).catch(() => {})
        })
    )

    if (!companies.length) return

    let loaded = false
    const script = (src) => {
        const element = document.createElement("script")
        element.async = true
        element.src = src
        document.head.appendChild(element)
    }

    function load() {
        if (loaded) return
        loaded = true

        if (tags.ga4Id || tags.googleAdsId) {
            window.dataLayer = window.dataLayer || []
            window.gtag = function () {
                window.dataLayer.push(arguments)
            }
            window.gtag("js", new Date())
            if (tags.ga4Id) window.gtag("config", tags.ga4Id)
            if (tags.googleAdsId) window.gtag("config", tags.googleAdsId)
            script("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(tags.ga4Id || tags.googleAdsId))
        }

        if (tags.metaPixelId) {
            const fbq = (window.fbq = function () {
                fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments)
            })
            window._fbq = fbq
            fbq.push = fbq
            fbq.loaded = true
            fbq.version = "2.0"
            fbq.queue = []
            fbq("init", tags.metaPixelId)
            fbq("track", "PageView")
            script("https://connect.facebook.net/en_US/fbevents.js")
        }

        if (tags.tiktokPixelId) {
            // TikTok's own queue: calls made before its script arrives are replayed
            window.TiktokAnalyticsObject = "ttq"
            const ttq = (window.ttq = window.ttq || [])
            ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"]
            ttq.methods.forEach((method) => {
                ttq[method] = (...args) => ttq.push([method, ...args])
            })
            ttq._i = { [tags.tiktokPixelId]: [] }
            ttq._t = { [tags.tiktokPixelId]: Date.now() }
            ttq._o = { [tags.tiktokPixelId]: {} }
            script("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + encodeURIComponent(tags.tiktokPixelId) + "&lib=ttq")
            ttq.page()
        }

        trackPurchase()
    }

    function adsConversion(label, details) {
        if (window.gtag && tags.googleAdsId && label) window.gtag("event", "conversion", { send_to: `${tags.googleAdsId}/${label}`, ...details })
    }

    function trackDownload(os) {
        if (!loaded) return
        if (window.gtag) window.gtag("event", "download_click", { os })
        adsConversion(tags.googleAdsDownloadLabel)
        if (window.fbq) window.fbq("trackCustom", "download_click", { os })
        if (window.ttq) window.ttq.track("Download", { description: os })
    }

    // the checkout comes back to /thanks; counted once per visit
    function trackPurchase() {
        if (!/^\/thanks\/?$/.test(location.pathname)) return
        const query = new URLSearchParams(location.search)
        const id = query.get("session_id") || ""
        const key = "scriptural-purchase" + id
        if (read(sessionStorage, key)) return
        write(sessionStorage, key, "1")

        const value = PRICES[query.get("price")]
        const money = value ? { value, currency: "USD" } : {}
        const details = id ? { transaction_id: id, ...money } : money
        if (window.gtag) window.gtag("event", "purchase", details)
        adsConversion(tags.googleAdsPurchaseLabel, details)
        // Meta refuses a Purchase with no amount
        if (window.fbq) value ? window.fbq("track", "Purchase", money) : window.fbq("trackCustom", "purchase")
        if (window.ttq) window.ttq.track("CompletePayment", money)
    }

    document.addEventListener("click", (event) => {
        const link = event.target.closest && event.target.closest('a[href^="/download/"]')
        const os = link && link.getAttribute("href").slice("/download/".length)
        if (os && os !== "source") trackDownload(os)
    })

    function ask() {
        if (document.querySelector(".consent")) return
        const banner = document.createElement("div")
        banner.className = "consent"
        banner.setAttribute("role", "region")
        banner.setAttribute("aria-label", "Cookies")
        const text = document.createElement("p")
        text.textContent = `May we use cookies from ${companies.join(", ").replace(/, ([^,]*)$/, " and $1")} to see which adverts bring churches here?`
        const buttons = document.createElement("div")
        for (const [label, choice] of [
            ["No thanks", "no"],
            ["Allow", "yes"]
        ]) {
            const button = document.createElement("button")
            button.type = "button"
            button.textContent = label
            button.addEventListener("click", () => {
                write(localStorage, CHOICE, choice)
                banner.remove()
                if (choice === "yes") load()
                // tags already running stop only with a fresh page
                else if (loaded) location.reload()
            })
            buttons.appendChild(button)
        }
        banner.append(text, buttons)
        document.body.appendChild(banner)
    }

    const footer = document.querySelector(".site-footer nav")
    if (footer) {
        const change = document.createElement("button")
        change.type = "button"
        change.textContent = "Cookie choices"
        change.addEventListener("click", ask)
        footer.appendChild(change)
    }

    const choice = read(localStorage, CHOICE)
    if (choice === "yes") load()
    else if (choice !== "no") ask()
})()
