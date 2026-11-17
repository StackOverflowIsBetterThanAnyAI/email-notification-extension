import { getToken, removeToken } from './auth.js'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class ApiError extends Error {
    constructor(status, message) {
        super(message)
        this.name = 'ApiError'
        this.status = status
    }
}

async function request(path, params = {}) {
    const url = new URL(API + path)
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue
        for (const v of Array.isArray(value) ? value : [value])
            url.searchParams.append(key, String(v))
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getToken(false)
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(15_000),
        })
        if (res.status === 401 && attempt === 0) {
            await removeToken(token)
            continue
        }
        if (!res.ok)
            throw new ApiError(
                res.status,
                `Gmail API request failed (HTTP ${res.status}).`
            )
        return res.json()
    }
    throw new ApiError(401, 'Authorization failed.')
}

/** @returns {Promise<{emailAddress: string, historyId: string}>} */
export function getProfile() {
    return request('/profile')
}

/** @returns {Promise<number>} unread messages in the inbox */
export async function getInboxUnreadCount() {
    const label = await request('/labels/INBOX')
    return Number(label.messagesUnread) || 0
}

export async function listNewInboxMessageIds(startHistoryId, maxPages = 10) {
    const ids = new Set()
    let pageToken
    let latestHistoryId = startHistoryId
    for (let page = 0; page < maxPages; page++) {
        const data = await request('/history', {
            startHistoryId,
            historyTypes: 'messageAdded',
            labelId: 'INBOX',
            maxResults: 100,
            pageToken,
        })
        if (data.historyId) latestHistoryId = data.historyId
        for (const entry of data.history ?? []) {
            for (const { message } of entry.messagesAdded ?? []) {
                if (message?.id) ids.add(message.id)
            }
        }
        pageToken = data.nextPageToken
        if (!pageToken) break
    }
    return { ids: [...ids], historyId: latestHistoryId }
}

export async function getMessageMeta(id) {
    const msg = await request(`/messages/${encodeURIComponent(id)}`, {
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
    })
    const headers = Object.fromEntries(
        (msg.payload?.headers ?? []).map((h) => [
            String(h.name).toLowerCase(),
            String(h.value ?? ''),
        ])
    )
    return {
        id: msg.id,
        labelIds: msg.labelIds ?? [],
        from: headers.from ?? '',
        subject: headers.subject ?? '',
        internalDate: Number(msg.internalDate) || 0,
    }
}
