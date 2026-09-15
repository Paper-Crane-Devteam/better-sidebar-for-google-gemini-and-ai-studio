#!/usr/bin/env node
/**
 * xpost — publish a build-in-public post (or thread) to X from the repo.
 *
 * Credentials live in `.env.x` at the repo root (gitignored). See
 * scripts/xpost/env.mjs for the four values and how to get them.
 *
 * Usage:
 *   node scripts/xpost.mjs whoami
 *   node scripts/xpost.mjs preview doc/build-in-public/drafts/2026-09-15.md
 *   node scripts/xpost.mjs post    doc/build-in-public/drafts/2026-09-15.md --yes
 *   node scripts/xpost.mjs post --text "one-off post" --media doc/x/a.png --yes
 *
 * Nothing is published without `--yes`; every other invocation is a dry run
 * that shows the exact text, the weighted character count, the attachments and
 * the billing estimate. A published post is public and costs money, so the
 * flag is deliberate rather than a prompt.
 *
 * Options:
 *   --yes                Actually publish
 *   --text <string>      Inline post text instead of a draft file
 *   --media <a,b>        Attachments for an inline post
 *   --reply-to <id>      Publish as a reply to an existing post
 *   --no-log             Skip appending to doc/build-in-public/posted.md
 */

import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, relative, resolve } from 'node:path'

import { REPO_ROOT, loadCredentials } from './xpost/env.mjs'
import { createClient } from './xpost/api.mjs'
import { assertAttachable, describeMedia, mb, uploadMedia } from './xpost/media.mjs'
import {
  MAX_WEIGHTED_LENGTH,
  findUrls,
  parseDraft,
  validate,
  weightedLength,
} from './xpost/draft.mjs'

const LEDGER = resolve(REPO_ROOT, 'doc/build-in-public/posted.md')

// Pay-per-usage rates, Jan 2026 onward. A post carrying a link is billed at
// the higher link rate, which is why the estimate is worth printing.
const PRICE_POST = 0.015
const PRICE_POST_WITH_LINK = 0.2

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split('=')
    if (inline !== undefined) {
      flags[name] = inline
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      flags[name] = argv[++i]
    } else {
      flags[name] = true
    }
  }
  return { flags, positional }
}

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

function collectPosts(flags, positional) {
  const file = positional[0] || flags.file
  if (file) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) throw new Error(`Draft not found: ${path}`)
    return { posts: parseDraft(path), source: path }
  }
  if (typeof flags.text === 'string') {
    const media = String(flags.media || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(p => resolve(process.cwd(), p))
    return { posts: [{ text: flags.text, media }], source: null }
  }
  throw new Error('Pass a draft file path, or --text "..."')
}

function describeAll(posts) {
  return posts.map(post => {
    for (const path of post.media) {
      if (!existsSync(path)) throw new Error(`Attachment not found: ${path}`)
      if (!statSync(path).isFile()) throw new Error(`Not a file: ${path}`)
    }
    const media = post.media.map(describeMedia)
    assertAttachable(media)
    return { ...post, media }
  })
}

function preview(posts, source) {
  const problems = validate(posts)
  let cost = 0

  console.log('')
  console.log(
    `${posts.length === 1 ? 'Single post' : `Thread of ${posts.length} posts`}` +
      (source ? ` from ${relative(REPO_ROOT, source)}` : '')
  )

  posts.forEach((post, i) => {
    const len = weightedLength(post.text)
    const urls = findUrls(post.text)
    cost += urls.length ? PRICE_POST_WITH_LINK : PRICE_POST

    console.log('')
    console.log(`  ── ${i + 1}/${posts.length} ── ${len}/${MAX_WEIGHTED_LENGTH} weighted chars`)
    for (const line of (post.text || '(no text)').split('\n')) {
      console.log(`  │ ${line}`)
    }
    for (const m of post.media) {
      console.log(`  📎 ${basename(m.path)}  ${m.category}  ${mb(m.bytes)}`)
    }
    if (urls.length) {
      console.log(`  🔗 ${urls.length} link(s) — billed at the link rate`)
    }
  })

  console.log('')
  console.log(`  Estimated cost: $${cost.toFixed(3)}`)

  if (problems.length) {
    console.log('')
    for (const p of problems) console.log(`  ✗ ${p}`)
  }
  return problems
}

async function publish(client, posts, replyToHead = null) {
  const urls = []
  let replyTo = replyToHead

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    console.log(`\n  Publishing ${i + 1}/${posts.length}…`)

    const mediaIds = []
    for (const item of post.media) {
      mediaIds.push(await uploadMedia(client, item, msg => console.log(msg)))
    }

    const body = {}
    if (post.text) body.text = post.text
    if (mediaIds.length) body.media = { media_ids: mediaIds }
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo }

    const res = await client.createPost(body)
    const id = res.data?.id
    if (!id) throw new Error(`No post id in response: ${JSON.stringify(res)}`)
    replyTo = id
    urls.push(`https://x.com/i/web/status/${id}`)
    console.log(`    → ${urls.at(-1)}`)
  }

  return urls
}

function appendLedger({ urls, posts, source, commit }) {
  mkdirSync(resolve(REPO_ROOT, 'doc/build-in-public'), { recursive: true })
  if (!existsSync(LEDGER)) {
    appendFileSync(
      LEDGER,
      '# Posted to X\n\n' +
        'Appended by `scripts/xpost.mjs`. The commit recorded on each entry is the\n' +
        'repo HEAD at publish time, which is what tells the next post where to\n' +
        'start reading the log from.\n'
    )
  }

  const date = new Date().toISOString().slice(0, 10)
  const firstLine = (posts[0].text || '').split('\n')[0].slice(0, 80)
  const lines = [
    '',
    `## ${date} · ${commit}`,
    '',
    `- ${firstLine}`,
    `- ${posts.length} post(s), ${posts.reduce((n, p) => n + p.media.length, 0)} attachment(s)`,
    source ? `- draft: ${relative(REPO_ROOT, source)}` : '- draft: inline --text',
    ...urls.map(u => `- ${u}`),
    '',
  ]
  appendFileSync(LEDGER, lines.join('\n'))
  console.log(`\n  Logged to ${relative(REPO_ROOT, LEDGER)}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { flags, positional } = parseArgs(rest)

  if (!command || command === 'help' || flags.help) {
    console.log(
      'Usage:\n' +
        '  node scripts/xpost.mjs whoami\n' +
        '  node scripts/xpost.mjs preview <draft.md>\n' +
        '  node scripts/xpost.mjs post <draft.md> --yes\n' +
        '  node scripts/xpost.mjs post --text "..." [--media a.png,b.png] --yes\n'
    )
    return
  }

  if (command === 'whoami') {
    const client = createClient(loadCredentials())
    const me = await client.me()
    console.log(`Authenticated as @${me.data?.username} (${me.data?.id})`)
    return
  }

  if (command !== 'post' && command !== 'preview') {
    throw new Error(`Unknown command "${command}". Try help.`)
  }

  const { posts: parsed, source } = collectPosts(flags, positional)
  const posts = describeAll(parsed)
  const problems = preview(posts, source)

  if (command === 'preview' || flags.yes !== true) {
    console.log(
      problems.length
        ? '\n  Not published: fix the problems above.\n'
        : '\n  Dry run. Re-run with --yes to publish.\n'
    )
    process.exitCode = problems.length ? 1 : 0
    return
  }
  if (problems.length) {
    throw new Error('Refusing to publish while the draft has problems')
  }

  const client = createClient(loadCredentials())
  const replyToHead = typeof flags['reply-to'] === 'string' ? flags['reply-to'] : null

  const urls = await publish(client, posts, replyToHead)
  if (flags.log !== false && flags['no-log'] !== true) {
    appendLedger({ urls, posts, source, commit: headCommit() })
  }
  console.log('')
}

main().catch(err => {
  console.error(`\n✗ ${err.message}\n`)
  process.exit(1)
})
