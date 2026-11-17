#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extensionIdFromKey } from './extension-id.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')
const exampleFile = join(root, '.env.example')
const force = process.argv.includes('--force')
const KEY_LINE = /^EXTENSION_PUBLIC_KEY=(.*)$/m

let env = existsSync(envFile)
    ? await readFile(envFile, 'utf8')
    : existsSync(exampleFile)
      ? await readFile(exampleFile, 'utf8')
      : ''

const existing = KEY_LINE.exec(env)?.[1]?.trim()
if (existing && !force) {
    console.log(`EXTENSION_PUBLIC_KEY is already set in .env.`)
    console.log(`Your extension ID: ${extensionIdFromKey(existing)}`)
    console.log(
        'Run "npm run keygen -- --force" to replace it. This changes the extension ID,'
    )
    console.log(
        'so you would also need a new OAuth client for the new ID.'
    )
    process.exit(0)
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

env = KEY_LINE.test(env)
    ? env.replace(KEY_LINE, `EXTENSION_PUBLIC_KEY=${key}`)
    : `${env.trimEnd()}\nEXTENSION_PUBLIC_KEY=${key}\n`
await writeFile(envFile, env)

console.log('Wrote a new EXTENSION_PUBLIC_KEY to .env.')
console.log(`Your extension ID: ${extensionIdFromKey(key)}`)
console.log(
    'Use this ID as "Item ID" when creating the OAuth client (type "Chrome Extension").'
)
