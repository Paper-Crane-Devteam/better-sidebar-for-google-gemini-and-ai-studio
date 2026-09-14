/**
 * Built-in Skill definitions.
 *
 * Migrated from prompts/utilities/*.ts + built-in-registry.ts.
 * These are immutable — users can only enable/disable them.
 *
 * `title` and `description` are i18n keys resolved at display time via `t()`.
 * `titleKey` / `descriptionKey` store the key; the fields are filled at runtime
 * by `skill-registry.ts` so consumers see localized strings.
 */

import type { Skill } from './types';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'builtin-auto-classify',
    type: 'builtin',
    agentId: 'bettersidebar',
    title: 'Auto-Classify Conversations',
    description: 'Automatically organize conversations into folders and tags based on their titles',
    titleKey: 'agent.skills.autoClassify.title',
    descriptionKey: 'agent.skills.autoClassify.description',
    icon: 'FolderTree',
    promptContent: `## Task: Auto-Classify Conversations

Help the user organize their conversations by:
1. First, query all conversations that are NOT yet classified and NOT soft-deleted. "Not yet classified" means:
   \`WHERE deleted_at IS NULL AND (folder_id IS NULL OR folder_id = '<CONVERSATION_INBOX_ID>')\`
   \`<CONVERSATION_INBOX_ID>\` above is already the real inbox folder ID — copy it verbatim into your SQL. Never look the inbox up by name; its name is localized.
2. Analyze their titles to identify natural categories (e.g., coding, writing, research, casual).
3. Check existing folders and tags to reuse them when appropriate.
4. Propose a classification plan to the user (show which conversations go where).
5. After the user confirms (or if they just say "go ahead"), create the necessary folders/tags and move conversations.

Tips:
- Group related conversations together.
- Use descriptive folder names.
- Create tags for cross-cutting themes (e.g., "project-x", "learning", "work").
- Don't move conversations that are already well-organized.
- Conversations in the inbox are considered unclassified and should be included in the classification.
- Never create, rename or delete an inbox folder.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-find-empty-chats',
    type: 'builtin',
    agentId: 'bettersidebar',
    title: 'Sync Missing Messages',
    description:
      'Find conversations whose messages were never recorded, then sync their content',
    titleKey: 'agent.skills.syncMessages.title',
    descriptionKey: 'agent.skills.syncMessages.description',
    icon: 'RefreshCw',
    promptContent: `## Task: Sync Conversations With No Messages

A conversation only gets its messages recorded while the user has it open. Anything
they haven't visited since installing the extension is in the database as a title with
no content — which is what makes search and export come up short. This skill finds
those conversations and fills them in with \`sync_conversation_messages\`.

This is not a cleanup task. Do not propose deleting anything unless the user asks.

1. Count them FIRST, with no LIMIT. One run can only carry 50 conversations, so the
   list you fetch in step 2 is a page, not the total — reporting "50 conversations need
   syncing" when there are 300 is a wrong answer, and the user has no way to tell.

   \`\`\`sql
   SELECT COUNT(*) AS total
   FROM conversations c
   WHERE c.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
   \`\`\`

   Keep the platform filter from the platform rules above in both queries, and skip
   soft-deleted rows.

2. Then fetch the batch to sync — the most recently active ones first:

   \`\`\`sql
   SELECT c.external_id, c.title, datetime(c.last_active_at, 'unixepoch') AS last_active
   FROM conversations c
   WHERE c.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
   ORDER BY c.last_active_at DESC
   LIMIT 50
   \`\`\`

3. Report the total from step 1, and say plainly how much of it this run covers:
   "共 300 个没有消息记录，这轮同步最近的 50 个，剩下的可以再跑一次". If the total is
   zero, say so and call \`complete_task\`.

4. Explain what syncing involves, in plain language, BEFORE you call the tool. The user
   needs to know all of this:
   - the tab will leave this conversation and open each one in turn, scrolling its
     history to load the older messages
   - it takes roughly 10–30 seconds per conversation, and they should leave the tab alone
   - this agent session ends when the sync starts — you will not be able to report back
   - the tab returns here when it finishes, with a summary toast

5. Then call \`sync_conversation_messages\` with the \`external_id\` values, as the LAST
   tool call in that response (nothing after it will run):

   \`\`\`
   <bs_agent_tool>
   {"name": "sync_conversation_messages", "description": "同步 12 个空对话的消息", "params": {"conversation_ids": ["c_abc123", "c_def456"]}}
   </bs_agent_tool>
   \`\`\`

   \`conversation_ids\` is a real JSON array, exactly as above. Writing it as a quoted
   string (\`"conversation_ids": "[...]"\`) leaves the inner quotes unescaped and the
   whole call is thrown away.

Notes:
- Max 50 per run — that cap is the tool's, not the user's problem, so never present a
  batch of 50 as if it were the whole job.
- \`conversation_ids\` takes \`conversations.external_id\` (the id in the conversation
  URL), not the internal \`id\`.
- If the user only wanted to see the list, skip the sync and call \`complete_task\`.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-export-chats',
    type: 'builtin',
    agentId: 'bettersidebar',
    title: 'Export Conversations',
    description: 'Query and display conversation data for the user',
    titleKey: 'agent.skills.export.title',
    descriptionKey: 'agent.skills.export.description',
    icon: 'Download',
    promptContent: `## Task: Export Conversations

Help the user download their conversations as files:
1. Work out which conversations they mean — by title, folder, tag, date range, or the one they
   are looking at. Use \`execute_sql\` to find the \`id\` values.
2. Call \`export\` with those ids. Pass every id in a single call rather than one call each.
3. If they named a format, pass it. If they did not, leave \`format\` out — the extension asks
   them with its own picker. Never ask about the format yourself; a question ends the task.
4. Report which files were downloaded, and mention anything that was skipped.

Notes:
- Several formats at once is fine: \`format\` accepts a list.
- \`separate_files: "true"\` gives one file per conversation inside a zip; the default merges
  them into a single file.
- A conversation with no synced messages cannot be exported — its content only reaches the
  database after it has been opened in the browser. Say which ones need opening.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-manage-prompts',
    type: 'builtin',
    agentId: 'bettersidebar',
    title: 'Manage Prompt Library',
    description:
      'Author, refactor and organize reusable prompts — including variables and imports',
    titleKey: 'agent.skills.managePrompts.title',
    descriptionKey: 'agent.skills.managePrompts.description',
    icon: 'Wand2',
    promptContent: `## Task: Manage the Prompt Library

The prompt library is \`prompts\` + \`prompt_folders\`. This is the user's own writing, not
captured data, so the bar is higher than for conversations: propose rewrites, keep their
voice, and never mass-edit bodies without showing what changes.

### What makes this module different

- **No \`platform\` column.** Prompts and prompt folders are shared across Gemini, AI Studio,
  ChatGPT and Claude. The platform filter rule above is for \`conversations\` and \`folders\`
  only — adding \`WHERE platform = ...\` here is a SQL error, not a stricter query.
- **Titles are the entire search surface.** A prompt is used by typing \`/\` in the platform's
  input box, which fuzzy-matches **titles only**: top 8, words ANDed, and a word scores far
  higher when it starts the title. Content is never matched. So "Untitled" or "Prompt 2" is
  effectively unreachable, and the front of the title is prime real estate. Fixing this is
  usually the highest-value thing you can do here.
- **\`type\`** is \`'normal'\` or \`'system'\` — a label plus a filter toggle in the sidebar and
  nothing else; both insert identically. Prompts created from the UI default to \`'system'\`.
  Match whatever the siblings in the same folder use.
- **\`icon\`** is a Lucide name from a fixed list: Sparkles, MessageSquare, FileText, Lightbulb,
  BookOpen, Code, Image, Zap, Send, Copy, Star, Heart, Bookmark, PenLine, Bot, User. Anything
  else silently falls back to Sparkles. NULL is fine.
- **\`order_index\` does nothing.** The tree sorts by pinned → favorited → folders first →
  then title or \`updated_at\`. Writing it is wasted work.
- **Favorites** live in \`favorites\` with \`target_type = 'prompt'\` and \`target_id\` = the prompt
  id. The schema comment only names conversations and messages, but \`'prompt'\` is what the
  star in the UI writes. \`UNIQUE(target_id, target_type)\`.
- **\`prompts\` has no \`is_pinned\`** — only \`prompt_folders\` does. Don't try to pin a prompt.
- **Folder deletes cascade.** Foreign keys are ON, so deleting a \`prompt_folders\` row deletes
  its subfolders and every prompt inside. Count them first, say the number, and offer to move
  them out instead.
- **Prompt inbox** = \`prompt_folders.id = '<PROMPT_INBOX_ID>'\` — where "save selection as
  prompt" drops things, so treat it as an unsorted pile. Never create, rename or delete it.
- **There is no FTS table for prompts** and the sidebar search only matches titles, so
  \`content LIKE '%...%'\` is something the user cannot do at all. Lead with it when they are
  hunting for "the prompt where I said ...".

### The template syntax — the reason a prompt is worth keeping

A body may contain three kinds of \`{{...}}\` token, resolved when the user picks the prompt:

| Syntax | Meaning |
| --- | --- |
| \`{{tone}}\` | free-text field in the fill-in form |
| \`{{tone:formal,casual,blunt}}\` | dropdown; **the first option is the default** |
| \`{{@import:Shared Rules}}\` | inlines another prompt's content |

How they actually behave:

- Imports resolve **first** and **recursively**, so an imported prompt's own variables turn
  into fields on the form. The match is on \`prompts.title\`, **exact and case-sensitive**, and
  the first row wins if two prompts share a title. No match leaves the literal text
  \`[not found: Title]\` in the prompt; a cycle leaves \`[circular: Title]\`. Both fail silently —
  nothing warns the user before they send it.
- A token is \`{{\` + anything containing no braces + \`}}\`. There is no escape, so \`{{\` in the
  text is always a variable. Single braces (JSON, code samples) are safe.
- Values are keyed by **name**, but tokens are de-duplicated by **raw text**. Repeating
  \`{{code}}\` gives one field used in both places (good). Writing \`{{lang}}\` in one place and
  \`{{lang:go,rust}}\` in another gives two fields fighting over one value (bad) — declare each
  name once, with its options.
- **An unfilled variable becomes an empty string**, not a leftover placeholder. A template
  that only reads correctly when every field is filled comes out mangled instead of obviously
  incomplete. Keep the sentence around a variable able to survive a blank.

Use that to write templates worth having:

- A closed set of choices belongs in a dropdown, not a text field: one click instead of
  typing, and typos never reach the model.
- The block the user repeats everywhere (role, tone, output format, "answer in Chinese")
  belongs in its own prompt, pulled in with \`{{@import:...}}\`. One edit then reaches every
  prompt that imports it. This is the highest-payoff refactor in this module and the one
  nobody does by hand.
- Put each \`{{...}}\` where its value is used rather than in a header block: the form is
  generated in first-occurrence order, so the reading order of the template is the tab order.

### Writing bodies through SQL

Prompt bodies are multi-line prose full of apostrophes. Two things bite:

- Escape \`'\` as \`''\` inside the SQL string.
- Inside the tool-call JSON, line breaks must be written \`\\n\`. A real newline in the JSON
  string breaks the parse and the entire call is thrown away.

After writing a long body, \`SELECT\` the row back and check it landed the way you meant.

### Good work in this module

- Audit: prompts with empty content, duplicate titles, titles \`/\` cannot find, broken or
  circular imports (\`content LIKE '%{{@import:%'\`, then check each target against the title
  list), and whatever is piled up in the inbox.
- Turn a hardcoded prompt into a template: point out the parts that change run to run, and
  offer the dropdown-vs-text choice per variable.
- Reorganize into folders by job, and rename for slash-discoverability — front-load the word
  the user would actually type.

Report edits as before/after per prompt, then call \`complete_task\`.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-manage-snippets',
    type: 'builtin',
    agentId: 'bettersidebar',
    title: 'Manage Snippets',
    description:
      'Organize, dedupe and search saved snippets — including their full text',
    titleKey: 'agent.skills.manageSnippets.title',
    descriptionKey: 'agent.skills.manageSnippets.description',
    icon: 'Bookmark',
    promptContent: `## Task: Manage Snippets

\`snippets\` + \`snippet_folders\` hold text the user saved off a page: whole model replies and
highlighted selections. Unlike prompts, this is captured material — it arrives fast, with
machine-made titles, and nobody ever tidies it. Sorting and searching it is the job.

### Where snippets come from, and why they look like that

- A **Save button on hover over a model reply** (Gemini, AI Studio) stores the reply's markdown
  as \`content\` and uses **the user's preceding question as the \`title\`** — stripped of a
  leading "you said", cut at 100 chars, falling back to the first 50 chars of the content. So
  titles are questions: long, and often near-duplicates of each other. Dragging that button
  onto a folder files it there; a plain click sends it to the inbox.
- The **selection toolbar** ("Save as snippet") stores whatever text was highlighted.
- Manual creation in the Snippets tab — the only path that leaves both \`source_*\` fields NULL.
- \`source_url\` is the page URL at capture time; \`source_platform\` is \`'gemini'\` or
  \`'aistudio'\`. A conversation URL on those platforms contains the conversation's
  \`external_id\`, so snippets can usually be traced back:
  \`FROM snippets s JOIN conversations c ON s.source_url LIKE '%' || c.external_id\`.
  Verify that against one sample row before trusting it across the whole table.

### What makes this module different

- **No \`platform\` column.** Snippets and their folders are shared across all platforms; the
  platform filter rule above applies to \`conversations\`/\`folders\`, not here.
- **The sidebar can only search titles**, in memory, and there is no FTS table for snippets.
  \`content LIKE '%...%'\` — plus \`LENGTH(content)\` and \`substr(...)\` — is something the user
  cannot do from the UI at all. That is your main advantage here; reach for it early.
- **Content is long.** A saved reply is routinely thousands of characters. Scan with
  \`substr(content, 1, 500)\`, size things up with \`SELECT COUNT(*), SUM(LENGTH(content))\`, and
  read a row in full only once it is the row that matters.
- **Duplicates are normal.** Saving the same reply twice, or saving a reply and then a
  selection taken out of it, both leave two rows. Match on identical \`content\`, or on
  \`LENGTH(content)\` plus a \`substr\` prefix, and keep the oldest unless told otherwise.
- **\`is_pinned\` works from SQL** and the tree honours it — pinned rows sort to the top of
  their folder. The UI only exposes pinning for folders, so this is a small thing you can do
  that the user cannot.
- **Favorites** live in \`favorites\` with \`target_type = 'snippet'\`.
- **\`order_index\` does nothing**; sorting is pinned → favorited → folders first → title or
  \`updated_at\`.
- **Folder deletes cascade** with foreign keys ON: a \`snippet_folders\` delete takes its
  subfolders and every snippet inside with it. Count and state the number before deleting.
- **Snippet inbox** = \`snippet_folders.id = '<SNIPPET_INBOX_ID>'\`. Anything saved without a
  target lands there — the unsorted queue. Never create, rename or delete it.
- **The \`export\` tool does not handle snippets** — it takes conversation ids only. If the user
  wants files, tell them the right-click Export menu on a snippet offers markdown, text, JSON,
  Obsidian and Notion. Never claim you exported a snippet.
- Reading happens in a **folder-scoped reader drawer**, so a folder behaves like a reading
  list: grouping by topic and keeping titles short is what makes it usable.

### Good work in this module

- Empty the inbox: read titles plus a \`substr\` of each content, propose folders by topic, then
  move in bulk.
- Retitle: the auto-title is the old question. Offer a short descriptive title drawn from the
  content, keeping the original wording wherever it was already good.
- Dedupe, with the counts stated before anything is deleted.
- The content search the sidebar cannot do: "the snippet where the migration steps were".
- Provenance reports: snippets whose source conversation is soft-deleted or was never synced,
  snippets per conversation, or a whole folder condensed into one overview.

Say what changed, per row or per group, then call \`complete_task\`.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-docx-review',
    type: 'builtin',
    agentId: 'workspace',
    title: 'Review a Word Document',
    description:
      'Work through a .docx chapter by chapter — comment on problems, suggest fixes as tracked changes',
    titleKey: 'agent.skills.docxReview.title',
    descriptionKey: 'agent.skills.docxReview.description',
    icon: 'FileText',
    promptContent: `## Task: Review or Revise a Word Document

This skill carries the full \`doc_edit\` operation list, which the tool schema deliberately
leaves out. It also carries the working order, and that order matters more than the syntax.

### Read before you write. Always, and in this order.

1. **\`doc_read path="…"\`** with nothing else. That returns the outline, the counts, and the
   warnings. The warnings are the part to actually read — existing tracked changes, field
   codes, a protected document — because each one changes what you should do next. The facts
   also name any text **outside the body**: \`hd1 = the first-page header\`, \`fn = footnotes\`.
   If the user asks about something you cannot find in the body, look there before concluding
   it is not in the document.
2. **If it already has comments, read them first.** On a thesis they usually *are* the
   review the user is asking you to address, and answering feedback you never read is the
   most expensive way to be unhelpful.
3. **Read a range, not the document.** \`mode="range" range="p12-p48"\`, one section at a
   time, using the ids from the outline. Output is capped per round; asking for everything
   gets you a silent truncation and a wrong picture of the file.
4. **\`mode="search" query="…"\`** to find a term without reading around it. This is how you
   check whether a fix needs to be applied in more than one place. Search covers **every**
   part, including headers and footnotes, so it is also how you find out where something lives.

### Addresses

| form | means |
| --- | --- |
| \`p12\` | a paragraph of the body |
| \`t3\` | a table of the body |
| \`t3r2\` | row 2 of table \`t3\` |
| \`t3r2c1\` | row 2, column 1 of table \`t3\` |
| \`hd1\` / \`ft1\` | a header / footer part. \`hd1:p2\` for a paragraph in it |
| \`fn\` / \`en\` | footnotes / endnotes. \`fn:p3\` for one paragraph |

A projected table carries its own axes so you never have to count:

\`\`\`
[t2 4×3 · cells t2r1c1… · ∅ = empty, fill with set_text]
| r\\c | c1 | c2 | c3 |
| --- | --- | --- | --- |
| r1 | 序号 | 检查内容 | 自查评估结果 |
| r2 | 1 | 是否建立管理制度 | ∅ |
\`\`\`

So the blank result cell on row 2 is \`t2r2c3\`. ∅ means the cell exists and is empty; — means
the row has no cell in that position at all.

⚠️ **Do not fill a blank column by replacing the neighbouring cell's text.** That is the one
mistake this address space exists to prevent: \`replace_text\` puts the new text where the
quoted text is, so quoting column 2 writes the answer into column 2. Use \`set_text\` with the
cell id.

### Comment, don't rewrite — unless they asked for the rewrite

Two different requests, two different outputs:

- **"Review my paper" / "what's wrong with this" → comments.** No text changes at all. This
  is the supervisor's form of feedback and it is the safe default. A comment cannot be wrong
  in a way that costs the user anything.
- **"Fix the grammar" / "rewrite this section" → tracked changes.** Actual edits, which Word
  shows inline with Accept and Reject on each one.

When in doubt, comment. Then offer to make the changes.

### The operations

Every one goes in the \`ops\` array of a single \`doc_edit\` call. \`path\` is separate.

**\`replace_text\`** — rewrite a stretch of text that is already there.
| param | |
| --- | --- |
| \`old_text\` | the exact text to replace, quoted from \`doc_read\` output |
| \`new_text\` | the replacement; \`""\` deletes the text |
| \`scope\` | optional \`"p12"\`, \`"t3"\`, \`"t3r2c1"\`, \`"hd1"\` — narrows, and reaches parts outside the body |
| \`all\` | optional \`true\` — replace every occurrence |

⚠️ Without \`scope\` this searches the **body only**. A term that also appears in a header is
reported in the result and left alone; change it with a second op scoped to that part.

**\`set_text\`** — put text into an **empty** paragraph or table cell.
| param | |
| --- | --- |
| \`scope\` | required — \`"t3r2c1"\` or \`"p12"\` |
| \`text\` | what to write |

This is the only op addressed by id alone, so it refuses any target that already has text —
use \`replace_text\` for that. It is how you fill in a blank column, a blank form field or an
empty line. New text inherits the target's own formatting, so a filled cell matches its column.

**\`comment\`** — attach a margin note, changing no text.
| param | |
| --- | --- |
| \`text\` | the comment itself. Newlines become paragraphs. |
| \`old_text\` | the phrase to attach it to |
| \`scope\` | \`"p12"\` — comment on the whole paragraph. Use this instead of \`old_text\` when the sentence runs through an equation, an image or a citation field. |

⚠️ Body only. Word shows no comments in a header, a footer or a footnote, so those are
refused rather than written somewhere the user would never see them.

**\`insert_paragraph\`** — add a paragraph.
| param | |
| --- | --- |
| \`text\` | the new paragraph |
| \`after\` or \`before\` | a paragraph id — exactly one of the two |
| \`style\` | optional style **id** |

**\`delete_paragraph\`** — remove a whole paragraph. Takes \`scope\` (an id) or \`old_text\`.

**\`set_style\`** — \`scope\` + \`style\`. Mostly for promoting a line to a heading in a document
that has no real outline.

### Table structure

**\`insert_table\`** — a new table.
| param | |
| --- | --- |
| \`rows\` | array of arrays, one inner array per row: \`[["Item","Result"],["A",""]]\` |
| \`after\` or \`before\` | a paragraph or table id — exactly one of the two |
| \`header\` | optional \`false\` — by default the first row is bold and repeats on each page |
| \`style\` | optional table style **id**. Without one you get a plainly bordered table |

**\`insert_row\`** — one more row in an existing table.
| param | |
| --- | --- |
| \`table\` | \`"t3"\` — append at the end. This is the usual form |
| \`after\` or \`before\` | \`"t3r4"\` — instead of \`table\`, to place it precisely |
| \`cells\` | optional \`["1","是否…",""]\`, left to right. Short lists leave the rest empty |

The new row copies its shape from a row that is already there — column widths, shading,
borders, fonts — so it matches. Anchoring on the header row gives you the header's look;
anchor on a data row, or just pass \`table\` and let it copy the last one.

**\`delete_row\`** — \`scope="t3r4"\`. Refused on a table's last remaining row.

**\`delete_table\`** — \`scope="t3"\`. In track mode every row is marked deleted as one change,
so the user can still reject it.

⚠️ \`style\` is a style **id**, not the name Word shows in its gallery. In a Chinese or German
document those differ — \`标题 2\` is often the id \`2\`. If you pass an unknown id the call is
refused and tells you the ids that exist.

### The one rule that prevents a wrong edit

**\`old_text\` is the address. Paragraph ids are not** — except for \`set_text\`, which cannot
have one and is restricted to empty targets because of it.

Insert a paragraph and every later id shifts, so a \`pN\` you noted a few rounds ago may now
point somewhere else — and nothing in the output would look wrong. Spacing is forgiven when
matching; wording is not. Copy the text from the most recent \`doc_read\`, not from your own
summary of it. If you are using \`set_text\` or a cell id, read the table again in the same
turn first.

If a quote matches more than once the call is refused and lists the paragraphs. Two correct
responses: add surrounding words until it is unique, or pass \`scope\`. \`all=true\` is for a
deliberate global rename and nothing else — do not reach for it to get past the refusal.

### How to batch

Read a section, then send its ops in **one** \`doc_edit\` call. But note:

⚠️ **Ops in one call cannot see each other's results.** They all resolve against the file as
it was, and two ops touching the same sentence are refused as overlapping, with nothing
written. If a later change depends on an earlier one, use a second call.

Five to ten ops per call is comfortable. A call that touches the same paragraph twice is the
one to split.

### Reporting

The result lists what applied, what was skipped and why, and where the backup went. Say all
three. In particular:

- If ops were skipped, say which and why — do not report the call as a success.
- If the document already had tracked changes from someone else, say so, because the user
  cannot tell yours apart from theirs by looking.
- Tell them where to look: comments are in Word's review pane, changes are inline with
  Accept and Reject.
- The pre-edit copy is under \`.history/\`. Mention it once, at the end.

Then \`complete_task\` with a summary of what you changed and what you would still flag.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-spreadsheet-analysis',
    type: 'builtin',
    agentId: 'workspace',
    title: 'Work Through a Spreadsheet',
    description:
      'Read an .xlsx by schema first, then compute — adding columns and sheets rather than changing the data',
    titleKey: 'agent.skills.spreadsheetAnalysis.title',
    descriptionKey: 'agent.skills.spreadsheetAnalysis.description',
    icon: 'Table',
    promptContent: `## Task: Analyse or Edit an Excel Workbook

This skill carries the full \`doc_edit\` operation list for \`.xlsx\`, which the tool schema
leaves out, and the working order. The order is the part that matters.

### The one habit that makes this work: add, don't change

A workbook is not prose. Numbers in it are referenced by *address* — by formulas, by charts,
by pivot ranges, by conditional formats. So the safe shape of almost every request is:

| they ask | you do |
| --- | --- |
| "work out the growth rate" | \`add_column\` with a formula |
| "sort by score" | read it, \`add_sheet\` with the sorted copy |
| "which rows are outliers" | \`add_column\` that flags them, or just say so |
| "fix the total in D20" | \`set_cell\` — one cell, deliberately |

The original data stays where it was, the user can compare, and nothing you do is hard to
undo. Rows and columns cannot be inserted or deleted at all, and sorting in place is refused,
for exactly this reason — the refusal message names the alternative each time.

### Read the schema before you read the data

1. **\`doc_read path="…"\`** with nothing else. That gives you every sheet, its used range, and
   **what each column holds** — \`A 序号(num) B 姓名(text) C 日期(date) D 分数(fx)\`. That line is
   usually all you need to plan the whole job, and it costs a fraction of reading rows.
   - \`num\` / \`text\` / \`date\` / \`bool\` are value types; \`fx\` means the column is **calculated**.
     Never overwrite an \`fx\` column — change what it reads from instead.
   - \`mixed\` usually means something is wrong: a stray header inside the data, or "N/A" in a
     numeric column. Worth mentioning before you compute anything from it.
2. **Read the warnings.** Charts, pivot tables, merged cells, shared formulas and protected
   sheets each change what you should do next, and every one of them is silent if you ignore it.
3. **Then read a region.** \`mode="range" range="Sheet1!A1:F50"\` — a rectangle, not a sheet. A
   bare sheet name (\`range="数据"\`) reads the whole used range and is fine for a small sheet;
   on a big one the output is capped and you will get a truncated picture without noticing what
   you missed.
4. **\`mode="search" query="…"\`** searches every sheet, **values and formulas**. It is the only
   way to answer "where is this rate used", because a formula's text is not visible in the grid.

### What a region read looks like

\`\`\`
Sheet1!A1:E3 of used A1:E2000
	A	B	C	D	E
1	序号	名称	日期	单价	金额
2	1	甲	2026-01-05	12.5	25
3	2	乙	2026-01-06	3.5	7
Formulas (2): E2 =D2*2 (shared down its range — do not overwrite) · E3 shares the formula above it
\`\`\`

- The column letters and row numbers are the axes, so **every address is derivable** — the
  12.5 above is \`D2\`. Never count columns.
- The grid shows the **values** Excel last calculated; the \`Formulas\` line shows which cells are
  computed and how. Both are true and you need both.
- Dates come back as \`2026-01-05\`, restored from the serial number Excel actually stores. Do
  not try to do arithmetic on the original serial.
- Empty rows are skipped, so a jump in the row numbers is a gap in the data, not an error.
- \`(not yet calculated)\` means a formula has no cached result — usually one you just wrote.
  Excel fills it in on open.

### The operations

Every one goes in the \`ops\` array of a single \`doc_edit\` call. \`path\` is separate. A cell is
\`"Sheet1!C2"\`; the sheet may also be given as its own \`sheet\` parameter.

**\`set_cell\`** — one cell.
| param | |
| --- | --- |
| \`ref\` | \`"Sheet1!C2"\` |
| \`value\` | a number, text, or a formula starting with \`=\` |

A leading \`=\` means formula, exactly as in Excel. \`"007"\`, \`"1.10"\` and phone numbers stay
text, so nothing you write comes back looking different from what you wrote.

**\`set_cells\`** — a rectangle.
| param | |
| --- | --- |
| \`range\` | \`"Sheet1!C2:E10"\`, or \`"Sheet1!C2"\` for just the top-left corner |
| \`values\` | array of arrays, one inner array per row |

A \`values\` grid smaller than the range fills what it covers and leaves the rest alone.

**\`add_column\`** — the one to reach for. Appends to the right of the data.
| param | |
| --- | --- |
| \`sheet\` | which sheet |
| \`header\` | the header cell text |
| \`formula\` | a template using \`{row}\`: \`"=(C{row}-B{row})/B{row}"\` |
| \`values\` | instead of \`formula\` — one entry per data row |
| \`from_row\` / \`to_row\` | optional; defaults to the whole data range |

⚠️ **Write a formula, not a computed number.** \`=(C2-B2)/B2\` stays correct when the user edits
B2; \`0.14\` becomes a lie the moment they do. This is the single most valuable thing you can do
differently from a person pasting values in.

**\`clear_cells\`** — \`range\`. Empties cells but keeps their formatting. Not the same as writing
\`""\`, which leaves a value that \`COUNTA\` still counts.

**\`add_sheet\`** — a new tab.
| param | |
| --- | --- |
| \`name\` | ≤31 characters, no \`: \\ / ? * [ ]\` |
| \`rows\` | optional array of arrays, e.g. \`[["项","值"],["合计","=SUM(数据!D2:D100)"]]\` |

Where every derived result belongs: sorted copies, summaries, statistics. Formulas here can
reference the source sheet, which keeps the summary live.

**\`rename_sheet\`** — \`sheet\` + \`name\`. Refused when any formula, chart or defined name
mentions the old name, because Excel stores those references as literal text and we would leave
them as \`#REF!\`. If it is refused, say so — renaming in Excel takes the user two seconds and
updates everything.

### What is refused, and what to do instead

- **\`insert_row\` / \`delete_row\` / \`insert_column\` / \`delete_column\`** — every address below or
  right of the change would move, and formulas, merged regions, table ranges, conditional
  formats, validations and chart references all store addresses. Append below the data, or use
  a new sheet.
- **\`sort\` / \`filter\`** — read, sort in your answer, \`add_sheet\` the result.
- **Overwriting a shared-formula host** — one cell holds the formula for a whole range and the
  rest only point at it, so replacing it blanks the column. \`add_column\` instead.
- **Number formats, fonts, merges, cell comments** — not editable here. A value keeps whatever
  format its cell already had, and a new cell inherits from its left-hand neighbour, so a filled
  column matches the one beside it. If a note is needed, put it in a column where it is visible.

### Recalculation, and why the answer is not in the file yet

Excel caches every formula's last result. After any write, this tool deletes the calculation
chain and marks the workbook for a full recalculation on open — so **the numbers are correct the
moment the user opens it, and a formula you wrote reads as \`(not yet calculated)\` until then.**
Say that when you report back. Never quote a computed figure you did not calculate yourself.

⚠️ **Pivot tables do not refresh on open.** If the workbook has one, tell the user to hit
Refresh, or it will disagree with the source sheet.

### How to batch

Read a region, then send its ops in **one** \`doc_edit\` call.

⚠️ **Ops in one call cannot see each other's results.** They all resolve against the file as it
was, so two ops writing the same cell are refused with both named, and \`add_column\` picks its
column from the *original* used range — two \`add_column\` ops in one call would aim at the same
place. One \`add_column\` per call, and put dependent changes in a second call.

### Reporting

The result lists what applied, what was skipped and why, and where the backup went. Say all
three, and in particular:

- If ops were skipped, say which and why — do not report the call as a success.
- Name the sheet and the exact range you wrote, so the user can go and look at it.
- Mention the recalculation-on-open behaviour once.
- The pre-edit copy is under \`.history/\`. Mention it once, at the end.

Then \`complete_task\` with what you changed and what you would still check.
`,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-pdf-review', type: 'builtin', agentId: 'workspace',
    title: 'Read and Review a PDF',
    description: 'PDF page text, bookmarks, comments, AcroForm fields and page operations',
    icon: 'FileText', enabled: true, createdAt: 0, updatedAt: 0,
    promptContent: `Read with doc_read outline first, then mode="range" and range="1-3".
Use mode="search", query=literal text, range="1-10" to locate passages.
Read existing comments with range="annotations:1-3", fields with range="fields:1-3".
Pages are 1-based; selections support "1-3,5". Follow nextRange when truncated.
Continuation ranges may end in @characterOffset; pass nextRange back unchanged.
Scans have no text to extract. No OCR, body-text editing or rendering in this release.

PDF doc_edit ops (JSON array):
- comment / note: page, text, optional x/y in unrotated PDF points (origin bottom left).
- highlight: page, text (unique exact quote), optional comment. Matches uniquely ignoring whitespace differences from text extraction. Highlights whole intersecting text items, so may include
  adjacent words within the same item; each item has its own quad. No vertical-text support.
- fill_form: name, value (string; boolean for checkbox). Read field names/options first.
- rotate_pages: pages, degrees (relative, multiple of 90).
- delete_pages: pages. Must leave a page.
- extract_pages: pages. Keeps selected pages in original order IN THE SAME FILE.
  To extract into another file, copy the PDF with manage_files first, then edit the copy.
- merge: source (workspace PDF path), optional pages selecting source pages. Appends to target.
- watermark: pages, text, optional size (36), opacity (0.2), x/y.
- page_numbers: pages, optional template ("{page} / {total}"), size (11), opacity (1), x/y.

Operations run sequentially; later page numbers refer to the current page order.
Do highlights before structural page operations or in another call after re-reading.
A rejected operation aborts the entire batch without saving. Form page copying/removal/merge,
XFA, encrypted PDFs and signature fields are refused. Removing pages drops old bookmarks
and page labels; report this. Page copies may not retain document-level navigation.
Watermarks, page numbers and filled text use Helvetica (WinAnsi); unsupported glyphs are
refused, so do not claim CJK form filling is supported. Comments support Unicode.
Coordinates do not account for viewer rotation. Inspect the result in a PDF viewer.
Report applied operations and backupPath from the tool result; never claim body text changed.
`,
  },
  {
    id: 'builtin-pptx-review', type: 'builtin', agentId: 'workspace',
    title: 'Read and Edit PowerPoint',
    description: 'PPTX slide text, speaker notes, shapes and slide ordering',
    icon: 'FileText', enabled: true, createdAt: 0, updatedAt: 0,
    promptContent: `Start with doc_read outline, then mode="range", range="1-3" (or "slide2").
Read slide titles, individual shape IDs/text and speaker notes. Search uses a literal query,
optionally within a slide range. Pass nextRange unchanged with the same mode and query.
Slide numbers are 1-based positions in the current presentation, not filenames.

PPTX doc_edit ops:
- replace_text: slide, old_text, new_text, optional shape (shape ID from doc_read).
  Quote exact unique text within a paragraph; cross-run replacement inherits the first
  affected run's formatting. Other runs and shape layout remain. No line breaks/tabs,
  field edits, alternate DrawingML representations, automatic text fitting or editing text in charts/SmartArt/images.
- set_notes: slide, text. Replaces speaker-notes body with plain text; newlines create
  paragraphs. Other notes placeholders stay. Creates notes when absent; empty text clears.
- duplicate_slide: slide, optional after (current position, 0 inserts first; default after source).
  Notes/charts/embedded workbooks are independent copies; masters/layout/media stay shared.
  Unsupported dependency types abort the batch.
- delete_slides: slides (array, e.g. [2,4]). Must leave one slide. Removes slides from
  presentation order; underlying parts remain to preserve references. This does NOT
  securely erase their content or shrink the file. Existing hyperlinks can still reach them.
- reorder_slides: order (array listing every current slide exactly once, e.g. [3,1,2]).

Operations run sequentially. Re-read after structural edits before using old slide numbers.
An invalid op aborts the entire batch without saving. Custom shows/sections block structural
edits; signed packages and nonstandard/Strict namespaces are unsupported. No tracked changes
in PowerPoint; edits are direct and backed up under .history. Explain before/after snippets
in change_summary. Report applied/skipped and backupPath, and ask the user to review layout
in PowerPoint/WPS since this tool does not render or resize text boxes. Creating a new PPTX
from Markdown is not implemented.
`,
  },
];
