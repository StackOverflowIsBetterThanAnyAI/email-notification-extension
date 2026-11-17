import { AuthError, getToken, signOutAndRevoke } from './auth.js'
import {
    ApiError,
    getInboxUnreadCount,
    getMessageMeta,
    getProfile,
    listNewInboxMessageIds,
} from './gmail.js'

const ALARM = 'gmail-poll'
const ALLOWED_INTERVALS = [0.25, 0.5, 1, 2, 5, 10, 15]
const MAX_INDIVIDUAL_NOTIFICATIONS = 3
const MAX_METADATA_FETCHES = 20
const MESSAGE_ID_RE = /^[0-9a-f]{1,32}$/i

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showDetails: true,
    intervalMinutes: 1,
})

const DEFAULT_STATE = Object.freeze({
    signedIn: false,
    email: '',
    historyId: '',
    unreadCount: 0,
    lastCheck: 0,
    lastError: '',
})

async function getSettings() {
    const { settings } = await chrome.storage.local.get('settings')
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(settings ?? {}) })
}

function sanitizeSettings(s) {
    const interval = Number(s.intervalMinutes)
    return {
        enabled: Boolean(s.enabled),
        showDetails: Boolean(s.showDetails),
        intervalMinutes: ALLOWED_INTERVALS.includes(interval)
            ? interval
            : DEFAULT_SETTINGS.intervalMinutes,
    }
}

async function getState() {
    const { state } = await chrome.storage.local.get('state')
    return { ...DEFAULT_STATE, ...(state ?? {}) }
}

async function patchState(patch) {
    const state = { ...(await getState()), ...patch }
    await chrome.storage.local.set({ state })
    await updateBadge(state)
    return state
}

const UNSAFE_CHARS_RE =
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g

function clean(text, max) {
    const s = String(text ?? '')
        .replace(UNSAFE_CHARS_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function senderName(from) {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
    if (m) return m[1].trim() || m[2].trim()
    return from
}

function gmailUrl(email, messageId) {
    const url = new URL('https://mail.google.com/mail/u/')
    if (email) url.searchParams.set('authuser', email)
    url.hash =
        messageId && MESSAGE_ID_RE.test(messageId)
            ? `#inbox/${messageId}`
            : '#inbox'
    return url.href
}

async function updateBadge(state) {
    let text = ''
    let title = 'Gmail Notifier - not signed in'
    let color = '#1a73e8'

    if (state.signedIn) {
        if (state.lastError) {
            text = '!'
            color = '#c5221f'
            title = `Gmail Notifier – ${state.lastError}`
        } else {
            const n = state.unreadCount
            text = n > 0 ? (n > 99 ? '99+' : String(n)) : ''
            title = `Gmail Notifier – ${n} unread ${n === 1 ? 'email' : 'emails'} (${state.email})`
        }
    }
    await chrome.action.setBadgeBackgroundColor({ color })
    await chrome.action.setBadgeTextColor?.({ color: '#ffffff' })
    await chrome.action.setBadgeText({ text })
    await chrome.action.setTitle({ title })
}

async function scheduleAlarm() {
    const [settings, state] = await Promise.all([getSettings(), getState()])
    await chrome.alarms.clear(ALARM)
    if (state.signedIn && settings.enabled) {
        await chrome.alarms.create(ALARM, {
            periodInMinutes: settings.intervalMinutes,
            delayInMinutes: settings.intervalMinutes,
        })
    }
}

let running = null

function checkMail(options) {
    running ??= doCheckMail(options).finally(() => {
        running = null
    })
    return running
}

async function doCheckMail({ notify = true } = {}) {
    const state = await getState()
    if (!state.signedIn) return state
    const settings = await getSettings()

    try {
        if (!state.historyId) {
            const profile = await getProfile()
            return await patchState({
                email: profile.emailAddress,
                historyId: profile.historyId,
                unreadCount: await getInboxUnreadCount(),
                lastCheck: Date.now(),
                lastError: '',
            })
        }

        let ids = []
        let historyId = state.historyId
        try {
            ;({ ids, historyId } = await listNewInboxMessageIds(
                state.historyId
            ))
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                historyId = (await getProfile()).historyId
                ids = []
            } else {
                throw err
            }
        }

        await patchState({ historyId })

        if (notify && settings.enabled && ids.length > 0) {
            const metas = []
            for (const id of ids.slice(-MAX_METADATA_FETCHES)) {
                try {
                    const meta = await getMessageMeta(id)
                    const labels = new Set(meta.labelIds)
                    if (
                        labels.has('INBOX') &&
                        labels.has('UNREAD') &&
                        !labels.has('SENT') &&
                        !labels.has('DRAFT')
                    ) {
                        metas.push(meta)
                    }
                } catch (err) {
                    if (!(err instanceof ApiError && err.status === 404))
                        throw err
                }
            }
            metas.sort((a, b) => a.internalDate - b.internalDate)
            await showNotifications(metas, state.email, settings.showDetails)
        }

        return await patchState({
            unreadCount: await getInboxUnreadCount(),
            lastCheck: Date.now(),
            lastError: '',
        })
    } catch (err) {
        console.warn('Mail check failed:', err?.name, err?.message)
        const lastError =
            err instanceof AuthError
                ? 'Sign-in required. Open the extension and sign in again.'
                : err instanceof ApiError
                  ? err.message
                  : 'Could not reach Gmail. Will retry automatically.'
        return patchState({ lastError, lastCheck: Date.now() })
    }
}

async function showNotifications(metas, email, showDetails) {
    if (metas.length === 0) return
    const base = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        contextMessage: clean(email, 80),
        priority: 1,
    }

    if (metas.length > MAX_INDIVIDUAL_NOTIFICATIONS || !showDetails) {
        const n = metas.length
        await chrome.notifications.create(`summary:${Date.now()}`, {
            ...base,
            title: n === 1 ? 'New email' : `${n} new emails`,
            message: showDetails
                ? metas
                      .slice(-3)
                      .map(
                          (m) =>
                              `${clean(senderName(m.from), 40)}: ${clean(m.subject, 60) || '(no subject)'}`
                      )
                      .join('\n')
                : `You have ${n === 1 ? 'a new email' : `${n} new emails`} in your inbox.`,
        })
        return
    }

    for (const m of metas) {
        await chrome.notifications.create(`msg:${m.id}`, {
            ...base,
            title: clean(senderName(m.from), 80) || 'New email',
            message: clean(m.subject, 200) || '(no subject)',
        })
    }
}

async function signIn() {
    await getToken(true)
    const profile = await getProfile()
    await patchState({
        signedIn: true,
        email: profile.emailAddress,
        historyId: profile.historyId,
        unreadCount: await getInboxUnreadCount(),
        lastCheck: Date.now(),
        lastError: '',
    })
    await scheduleAlarm()
    return getState()
}

async function signOut() {
    await chrome.alarms.clear(ALARM)
    await signOutAndRevoke()
    await chrome.storage.local.set({ state: { ...DEFAULT_STATE } })
    await updateBadge(DEFAULT_STATE)
    return getState()
}

chrome.runtime.onInstalled.addListener(async () => {
    await scheduleAlarm()
    await updateBadge(await getState())
})

chrome.runtime.onStartup.addListener(async () => {
    await scheduleAlarm()
    checkMail({ notify: true })
})

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) checkMail({ notify: true })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
    const state = await getState()
    const messageId = notificationId.startsWith('msg:')
        ? notificationId.slice(4)
        : ''
    await chrome.tabs.create({ url: gmailUrl(state.email, messageId) })
    await chrome.notifications.clear(notificationId)
})

const handlers = {
    getStatus: async () => ({
        state: await getState(),
        settings: await getSettings(),
    }),
    signIn: async () => ({ state: await signIn() }),
    signOut: async () => ({ state: await signOut() }),
    checkNow: async () => ({ state: await checkMail({ notify: true }) }),
    openGmail: async () => {
        const state = await getState()
        await chrome.tabs.create({ url: gmailUrl(state.email) })
        return {}
    },
    saveSettings: async (msg) => {
        const settings = sanitizeSettings({
            ...(await getSettings()),
            ...(msg.settings ?? {}),
        })
        await chrome.storage.local.set({ settings })
        await scheduleAlarm()
        return { settings }
    },
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (
        sender.id !== chrome.runtime.id ||
        sender.tab ||
        sender.origin !== `chrome-extension://${chrome.runtime.id}`
    ) {
        return false
    }
    const handler =
        typeof msg?.type === 'string' && Object.hasOwn(handlers, msg.type)
            ? handlers[msg.type]
            : null
    if (!handler) return false

    handler(msg)
        .then((data) => sendResponse({ ok: true, ...data }))
        .catch((err) => {
            const error =
                err instanceof AuthError || err instanceof ApiError
                    ? err.message
                    : 'Something went wrong. Please try again.'
            console.warn('Request failed:', msg.type, err?.name, err?.message)
            sendResponse({ ok: false, error })
        })
    return true
})
