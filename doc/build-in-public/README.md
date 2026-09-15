# Build in public

Everything needed to publish a build-in-public post to X from this repo.

```
doc/build-in-public/
  posted.md      ledger of what has already gone out, with the HEAD commit each time
  drafts/        one file per post, named YYYY-MM-DD.md
  assets/        screenshots and clips that drafts attach
```

## Publishing

```bash
node scripts/xpost.mjs whoami                              # check credentials
node scripts/xpost.mjs preview doc/build-in-public/drafts/2026-09-15.md
node scripts/xpost.mjs post    doc/build-in-public/drafts/2026-09-15.md --yes
```

Nothing is published without `--yes`. On success the script appends the post
URLs and the current HEAD commit to `posted.md`, which is how the next post
knows where to start reading `git log` from.

## Credentials

`.env.x` at the repo root, gitignored:

```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

From https://developer.x.com → your project → app → Keys and tokens. Two things
that trip people up:

- User authentication settings must be set to **Read and write** before the
  access token is generated. If the token predates that change, regenerate it
  or every post returns 403.
- Since January 2026 the API is pay-per-usage rather than tiered. A post costs
  about $0.015, and about $0.20 if it contains a link. At one post every two
  days that is a few dollars a month; `preview` prints the estimate.

## Draft format

`---` on its own line starts the next post in a thread. `@media:` attaches
files, resolved relative to the draft. `//` lines are notes to self.

```markdown
Shipped folder-aware chat routing today. New chats now land in the folder you
have selected instead of always dropping into Inbox.

@media: ../assets/2026-09-15-folders.png

---

// keep this one short
The fix was smaller than the bug report suggested — the folder was known at
create time, it just was not being passed down.
```

X's character budget is weighted: Latin text counts 1 per character, CJK and
emoji count 2, and any link counts as 23 no matter its length. So a Chinese
post gets roughly 140 characters against the 280 budget. `preview` shows the
weighted count and refuses to publish anything over.
