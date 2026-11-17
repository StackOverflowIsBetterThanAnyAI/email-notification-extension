#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extensionIdFromKey } from './extension-id.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const COPY = ['src', 'popup', 'icons']

const envFile = join(root, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const VALIDATORS = {
    GOOGLE_CLIENT_ID: (v) =>
        /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(v),
    EXTENSION_PUBLIC_KEY: (v) => /^[A-Za-z0-9+/]{200,}={0,2}$/.test(v),
}

const OPTIONAL = new Set(['EXTENSION_PUBLIC_KEY'])
const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g
const ONLY_PLACEHOLDER = /^\$\{([A-Z0-9_]+)\}$/

const errors = []

function fill(value) {
    if (typeof value === 'string') {
        const only = ONLY_PLACEHOLDER.exec(value)?.[1]
        if (only && OPTIONAL.has(only) && !process.env[only]?.trim())
            return undefined
        return value.replace(PLACEHOLDER, (_, name) => {
            const v = process.env[name]?.trim()
            if (!v)
                errors.push(
                    `${name} is not set (add it to .env – see .env.example).`
                )
            else if (VALIDATORS[name] && !VALIDATORS[name](v))
                errors.push(`${name} has an invalid format.`)
            return v ?? ''
        })
    }
    if (Array.isArray(value)) return value.map(fill)
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .map(([k, v]) => [k, fill(v)])
                .filter(([, v]) => v !== undefined)
        )
    }
    return value
}

const template = JSON.parse(
    await readFile(join(root, 'manifest.template.json'), 'utf8')
)
const manifest = fill(template)

if (errors.length) {
    console.error(
        'Build failed:\n' +
            [...new Set(errors)].map((e) => `  - ${e}`).join('\n')
    )
    process.exit(1)
}

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
for (const dir of COPY)
    await cp(join(root, dir), join(dist, dir), { recursive: true })
await writeFile(
    join(dist, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
)

console.log(`Built extension v${manifest.version} → ${dist}`)
if (manifest.key) {
    console.log(`Extension ID: ${extensionIdFromKey(manifest.key)}`)
} else {
    console.log(
        'No EXTENSION_PUBLIC_KEY set: Chrome assigns an ID based on the folder path.'
    )
    console.log(
        'Find it in chrome://extensions. It changes if you move the folder – run "npm run keygen" for a fixed ID.'
    )
}
console.log(
    'Load (or reload) this folder via chrome://extensions → "Load unpacked".'
)
