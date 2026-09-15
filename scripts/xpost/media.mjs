/**
 * Chunked media upload (initialize → append → finalize → status).
 *
 * The chunked path is used for images too, even though a single-shot endpoint
 * exists, so there is one code path to keep working instead of two.
 */

import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.srt': 'text/srt',
}

/** X's documented per-category ceilings for a non-Premium account. */
const LIMIT = {
  tweet_image: 5 * 1024 * 1024,
  tweet_gif: 15 * 1024 * 1024,
  tweet_video: 512 * 1024 * 1024,
}

const CHUNK = 4 * 1024 * 1024 // under the 5 MB recommendation

export function describeMedia(path) {
  const ext = extname(path).toLowerCase()
  const mediaType = MIME[ext]
  if (!mediaType) {
    throw new Error(`Unsupported media type "${ext}" for ${basename(path)}`)
  }
  const category =
    mediaType === 'image/gif'
      ? 'tweet_gif'
      : mediaType.startsWith('video/')
        ? 'tweet_video'
        : 'tweet_image'
  const bytes = statSync(path).size
  return { path, mediaType, category, bytes }
}

/** Only 4 photos, or 1 GIF, or 1 video may be attached to a post. */
export function assertAttachable(items) {
  if (!items.length) return
  const kinds = new Set(items.map(i => i.category))
  if (kinds.size > 1) {
    throw new Error('A post cannot mix images, GIFs and video')
  }
  const [kind] = kinds
  const max = kind === 'tweet_image' ? 4 : 1
  if (items.length > max) {
    throw new Error(`A post accepts at most ${max} ${kind} attachment(s), got ${items.length}`)
  }
  for (const item of items) {
    const limit = LIMIT[item.category]
    if (limit && item.bytes > limit) {
      throw new Error(
        `${basename(item.path)} is ${mb(item.bytes)} — over the ${mb(limit)} limit for ${item.category}`
      )
    }
  }
}

export function mb(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(Math.round(bytes / 1024), 1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function uploadMedia(client, item, log = () => {}) {
  const { path, mediaType, category, bytes } = item
  const name = basename(path)

  const init = await client.mediaInitialize({
    media_type: mediaType,
    media_category: category,
    total_bytes: bytes,
  })
  const id = init.data?.id
  if (!id) throw new Error(`initialize returned no media id for ${name}`)

  const buffer = readFileSync(path)
  const segments = Math.ceil(bytes / CHUNK) || 1
  for (let index = 0; index < segments; index++) {
    const slice = buffer.subarray(index * CHUNK, (index + 1) * CHUNK)
    const form = new FormData()
    form.set('segment_index', String(index))
    form.set('media', new Blob([slice], { type: mediaType }), name)
    await client.mediaAppend(id, form)
    if (segments > 1) log(`    ${name} chunk ${index + 1}/${segments}`)
  }

  let state = await client.mediaFinalize(id)
  let info = state.data?.processing_info

  // Video is transcoded server side; attaching it before that finishes fails.
  while (info && info.state !== 'succeeded' && info.state !== 'failed') {
    const wait = Math.max(info.check_after_secs ?? 1, 1)
    log(`    ${name} processing ${info.progress_percent ?? 0}% — waiting ${wait}s`)
    await sleep(wait * 1000)
    state = await client.mediaStatus(id)
    info = state.data?.processing_info
  }
  if (info?.state === 'failed') {
    throw new Error(`X failed to process ${name}: ${JSON.stringify(info)}`)
  }

  log(`    ${name} → media_id ${id}`)
  return id
}
