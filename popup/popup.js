const $ = (id) => document.getElementById(id)

const els = {
    status: $('status'),
    error: $('error'),
    loading: $('view-loading'),
    signedOut: $('view-signed-out'),
    signedIn: $('view-signed-in'),
    signedOutHeading: $('signed-out-heading'),
    signedInHeading: $('signed-in-heading'),
    account: $('account'),
    unread: $('unread'),
    lastCheck: $('last-check'),
    btnSignIn: $('btn-sign-in'),
    btnSignOut: $('btn-sign-out'),
    btnCheck: $('btn-check'),
    btnOpen: $('btn-open'),
    optEnabled: $('opt-enabled'),
    optDetails: $('opt-details'),
    optInterval: $('opt-interval'),
}

let currentView = null

async function send(type, extra = {}) {
    const res = await chrome.runtime.sendMessage({ type, ...extra })
    if (!res?.ok)
        throw new Error(res?.error || 'Something went wrong. Please try again.')
    return res
}

function announce(text) {
    els.status.textContent = ''
    if (text)
        setTimeout(() => {
            els.status.textContent = text
        }, 50)
}

function showError(text) {
    els.error.textContent = text || ''
    els.error.hidden = !text
}

function formatTime(ts) {
    if (!ts) return 'Never'
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(ts))
}

function render(state, settings) {
    const view = state.signedIn ? 'in' : 'out'
    els.loading.hidden = true
    els.loading.removeAttribute('aria-busy')
    els.signedOut.hidden = view !== 'out'
    els.signedIn.hidden = view !== 'in'

    if (state.signedIn) {
        els.account.textContent = state.email || '–'
        els.unread.textContent = String(state.unreadCount ?? 0)
        const time = document.createElement('time')
        if (state.lastCheck)
            time.dateTime = new Date(state.lastCheck).toISOString()
        time.textContent = formatTime(state.lastCheck)
        els.lastCheck.replaceChildren(time)
        showError(state.lastError)
    } else {
        showError('')
    }

    if (settings) {
        els.optEnabled.checked = settings.enabled
        els.optDetails.checked = settings.showDetails
        els.optInterval.value = String(settings.intervalMinutes)
        els.optDetails.disabled = !settings.enabled
        els.optInterval.disabled = !settings.enabled
    }

    const active = document.activeElement
    const focusLost =
        !active || active === document.body || active.closest('[hidden]')
    if (currentView && currentView !== view && focusLost) {
        ;(view === 'in' ? els.signedInHeading : els.signedOutHeading).focus()
    }
    currentView = view
}

async function withBusy(button, busyLabel, fn) {
    if (button.getAttribute('aria-disabled') === 'true') return
    button.setAttribute('aria-disabled', 'true')
    announce(busyLabel)
    try {
        await fn()
    } catch (err) {
        showError(err.message)
        announce('')
    } finally {
        button.removeAttribute('aria-disabled')
    }
}

els.btnSignIn.addEventListener('click', () =>
    withBusy(els.btnSignIn, 'Signing in…', async () => {
        showError('')
        const { state } = await send('signIn')
        const { settings } = await send('getStatus')
        render(state, settings)
        announce(`Signed in as ${state.email}.`)
    })
)

els.btnSignOut.addEventListener('click', () =>
    withBusy(els.btnSignOut, 'Signing out…', async () => {
        const { state } = await send('signOut')
        render(state, null)
        announce('Signed out. Access has been revoked.')
    })
)

els.btnCheck.addEventListener('click', () =>
    withBusy(els.btnCheck, 'Checking…', async () => {
        const { state } = await send('checkNow')
        render(state)
        if (!state.lastError) {
            const n = state.unreadCount
            announce(
                `Checked. ${n} unread ${n === 1 ? 'email' : 'emails'} in your inbox.`
            )
        }
    })
)

els.btnOpen.addEventListener('click', async () => {
    try {
        await send('openGmail')
        window.close()
    } catch (err) {
        showError(err.message)
    }
})

async function saveSettings() {
    try {
        const { settings } = await send('saveSettings', {
            settings: {
                enabled: els.optEnabled.checked,
                showDetails: els.optDetails.checked,
                intervalMinutes: Number(els.optInterval.value),
            },
        })
        els.optDetails.disabled = !settings.enabled
        els.optInterval.disabled = !settings.enabled
        announce('Settings saved.')
    } catch (err) {
        showError(err.message)
    }
}

for (const el of [els.optEnabled, els.optDetails, els.optInterval]) {
    el.addEventListener('change', saveSettings)
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state?.newValue)
        render(changes.state.newValue)
})

;(async () => {
    try {
        const { state, settings } = await send('getStatus')
        render(state, settings)
    } catch (err) {
        els.loading.hidden = true
        showError(err.message)
    }
})()
