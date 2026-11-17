import { createHash } from 'node:crypto'

export function extensionIdFromKey(base64Key) {
    return createHash('sha256')
        .update(Buffer.from(base64Key, 'base64'))
        .digest('hex')
        .slice(0, 32)
        .replace(/[0-9a-f]/g, (c) =>
            String.fromCharCode(97 + Number.parseInt(c, 16))
        )
}
