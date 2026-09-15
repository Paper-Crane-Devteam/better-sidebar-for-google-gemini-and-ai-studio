/**
 * Draft file format and X's weighted character count.
 *
 * A draft is one or more posts. `---` on its own line starts the next post in
 * the thread. Lines beginning with `@media:` attach files to the post they
 * appear in, resolved relative to the draft file. Lines starting with `//` are
 * notes to self and are dropped, as is a leading `---` front-matter block.
 *
 *     Shipped folder-aware chat routing today.
 *     @media: assets/2026-09-15-folders.png
 *
 *     ---
 *
 *     The tricky part was ...
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * X counts most Latin text as 1 per character and nearly everything else —
 * CJK, emoji — as 2, against a budget of 280. Chinese therefore gets ~140
 * characters. Links always count as 23 regardless of real length.
 * Mirrors the default twitter-text configuration v3.
 */
const LIGHT_RANGES = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
]

export const MAX_WEIGHTED_LENGTH = 280
const URL_WEIGHTED_LENGTH = 23

// Approximation of X's linkifier: schemed URLs plus bare www. hosts.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'）」，。、]+/gi

function isLight(codePoint) {
  return LIGHT_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

export function weightedLength(text) {
  const withoutUrls = text.replace(URL_RE, '')
  const urlCount = (text.match(URL_RE) || []).length

  let weight = 0
  for (const { segment } of segmenter.segment(withoutUrls)) {
    const cp = segment.codePointAt(0)
    // A grapheme cluster counts once; emoji sequences land on the heavy side.
    weight += segment.length === 1 && isLight(cp) ? 1 : 2
  }
  return weight + urlCount * URL_WEIGHTED_LENGTH
}

export function findUrls(text) {
  return text.match(URL_RE) || []
}

export function parseDraft(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const baseDir = dirname(resolve(filePath))

  let body = raw.replace(/^\uFEFF/, '')
  // Strip a YAML-ish front matter block if the file opens with one.
  const fm = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  if (fm) body = body.slice(fm[0].length)

  const blocks = body.split(/^\s*---\s*$/m)
  const posts = []

  for (const block of blocks) {
    const media = []
    const lines = []
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim()
      // `//` marks a note to self. `#` is left alone so hashtags survive.
      if (trimmed.startsWith('//')) continue
      const mediaDirective = trimmed.match(/^@media:\s*(.+)$/i)
      if (mediaDirective) {
        for (const part of mediaDirective[1].split(',')) {
          const p = part.trim()
          if (p) media.push(resolve(baseDir, p))
        }
        continue
      }
      lines.push(line)
    }
    const text = lines.join('\n').trim()
    if (!text && !media.length) continue
    posts.push({ text, media })
  }

  if (!posts.length) throw new Error(`${filePath} contains no posts`)
  return posts
}

export function validate(posts) {
  const problems = []
  posts.forEach((post, i) => {
    const len = weightedLength(post.text)
    if (len > MAX_WEIGHTED_LENGTH) {
      problems.push(`post ${i + 1} is ${len}/${MAX_WEIGHTED_LENGTH} weighted chars — trim it`)
    }
    if (!post.text && !post.media.length) {
      problems.push(`post ${i + 1} is empty`)
    }
  })
  return problems
}
