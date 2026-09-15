/**
 * Minimal OAuth 1.0a signer + fetch wrapper for api.x.com. No dependencies.
 */

import { createHmac, randomBytes } from 'node:crypto'

const API = 'https://api.x.com'

/** RFC 3986, which differs from encodeURIComponent on !*'() */
function pct(value) {
  return encodeURIComponent(String(value)).replace(
    /[!*'()]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
}

/**
 * Build the Authorization header.
 *
 * `bodyParams` must only be passed for application/x-www-form-urlencoded
 * bodies. JSON and multipart bodies are excluded from the signature base
 * string by the spec, so append/initialize sign the URL alone.
 */
function authHeader(creds, method, url, { queryParams = {}, bodyParams = {} } = {}) {
  const oauth = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.token,
    oauth_version: '1.0',
  }

  const all = { ...queryParams, ...bodyParams, ...oauth }
  const normalized = Object.keys(all)
    .map(k => [pct(k), pct(all[k])])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const base = [method.toUpperCase(), pct(url), pct(normalized)].join('&')
  const key = `${pct(creds.consumerSecret)}&${pct(creds.tokenSecret)}`
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64')

  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map(k => `${pct(k)}="${pct(oauth[k])}"`)
      .join(', ')
  )
}

class XApiError extends Error {
  constructor(status, path, payload) {
    const detail =
      payload?.detail ||
      payload?.errors?.[0]?.message ||
      payload?.errors?.[0]?.detail ||
      payload?.title ||
      (typeof payload === 'string' ? payload.slice(0, 400) : JSON.stringify(payload))
    super(`X API ${status} on ${path}: ${detail}`)
    this.name = 'XApiError'
    this.status = status
    this.payload = payload
  }
}

async function request(creds, method, path, { query, json, form } = {}) {
  const url = API + path
  const qs = new URLSearchParams(query || {})
  const fullUrl = qs.toString() ? `${url}?${qs}` : url

  const headers = {
    Authorization: authHeader(creds, method, url, { queryParams: query || {} }),
  }
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form !== undefined) {
    body = form // FormData; fetch sets the multipart boundary itself
  }

  const res = await fetch(fullUrl, { method, headers, body })
  const text = await res.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = text
  }
  if (!res.ok) throw new XApiError(res.status, path, payload)
  if (payload?.errors?.length && !payload?.data) {
    throw new XApiError(res.status, path, payload)
  }
  return payload
}

export function createClient(creds) {
  return {
    me: () => request(creds, 'GET', '/2/users/me', { query: { 'user.fields': 'username' } }),

    createPost: input => request(creds, 'POST', '/2/tweets', { json: input }),

    mediaInitialize: input =>
      request(creds, 'POST', '/2/media/upload/initialize', { json: input }),

    mediaAppend: (id, form) =>
      request(creds, 'POST', `/2/media/upload/${id}/append`, { form }),

    mediaFinalize: id => request(creds, 'POST', `/2/media/upload/${id}/finalize`),

    mediaStatus: id =>
      request(creds, 'GET', '/2/media/upload', {
        query: { command: 'STATUS', media_id: id },
      }),
  }
}
