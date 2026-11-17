export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.metadata'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export class AuthError extends Error {
    constructor(message) {
        super(message)
        this.name = 'AuthError'
    }
}

/**
 * Returns a valid access token or throws AuthError.
 * @param {boolean} interactive - may show Google's consent/sign-in UI
 */
export async function getToken(interactive = false) {
    let result
    try {
        result = await chrome.identity.getAuthToken({
            interactive,
            scopes: [GMAIL_SCOPE],
        })
    } catch (err) {
        throw new AuthError(
            interactive
                ? 'Sign-in was cancelled or failed.'
                : 'Sign-in required.'
        )
    }
    const token = typeof result === 'string' ? result : result?.token
    const granted =
        typeof result === 'object' ? result?.grantedScopes : undefined
    if (!token) throw new AuthError('Sign-in required.')
    if (Array.isArray(granted) && !granted.includes(GMAIL_SCOPE)) {
        await removeToken(token)
        throw new AuthError('Gmail access was not granted.')
    }
    return token
}

export async function removeToken(token) {
    try {
        await chrome.identity.removeCachedAuthToken({ token })
    } catch {}
}

export async function signOutAndRevoke() {
    let token = null
    try {
        token = await getToken(false)
    } catch {}
    if (token) {
        try {
            await fetch(REVOKE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ token }),
                credentials: 'omit',
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                signal: AbortSignal.timeout(10_000),
            })
        } catch {}
        await removeToken(token)
    }
    try {
        await chrome.identity.clearAllCachedAuthTokens()
    } catch {}
}
