/**
 * Credentials for the X API, read from `.env.x` at the repo root.
 *
 * OAuth 1.0a user context is used rather than OAuth 2.0 PKCE: the four values
 * below are issued once in the developer portal and never expire, so a script
 * that runs every couple of days needs no refresh dance and no callback server.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const REQUIRED = [
  'X_API_KEY',
  'X_API_SECRET',
  'X_ACCESS_TOKEN',
  'X_ACCESS_TOKEN_SECRET',
]

function parseDotenv(text) {
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function loadCredentials() {
  const envPath = resolve(REPO_ROOT, '.env.x')
  let fileEnv = {}
  try {
    fileEnv = parseDotenv(readFileSync(envPath, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const merged = { ...fileEnv, ...process.env }
  const missing = REQUIRED.filter(k => !merged[k])
  if (missing.length) {
    throw new Error(
      `Missing X credentials: ${missing.join(', ')}\n` +
        `Create ${envPath} with:\n` +
        REQUIRED.map(k => `  ${k}=...`).join('\n') +
        `\n\nGet them at https://developer.x.com → your app → Keys and tokens.\n` +
        `The access token must be regenerated after setting app permissions to\n` +
        `"Read and write", otherwise posting returns 403.`
    )
  }

  return {
    consumerKey: merged.X_API_KEY,
    consumerSecret: merged.X_API_SECRET,
    token: merged.X_ACCESS_TOKEN,
    tokenSecret: merged.X_ACCESS_TOKEN_SECRET,
  }
}
