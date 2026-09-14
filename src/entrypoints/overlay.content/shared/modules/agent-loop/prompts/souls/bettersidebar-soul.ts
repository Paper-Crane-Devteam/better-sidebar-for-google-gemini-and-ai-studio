/**
 * The Better Sidebar agent's soul — it operates on the extension's own data.
 *
 * Conversations, folders, tags, prompts, snippets: everything reachable through the local
 * SQLite database. ⚠️ It has **no file tools**. Those moved to the Workspace agent, which
 * is the whole reason the two are separate: an agent that could do both carried a
 * database schema *and* a file protocol in every prompt, and picked the wrong one often
 * enough to matter.
 *
 * Everything here is domain-specific by construction. The loop's protocol — tool call
 * format, how results come back, how a response may end — lives in `shared.ts`.
 */

import { SCHEMA } from '@/shared/db/schema';
import {
  INBOX_FOLDER_ID,
  SNIPPET_INBOX_ID,
  PROMPT_INBOX_ID,
} from '@/shared/constants/inbox';
import type { SoulContext } from '../../agents/types';
import {
  changeSummaryBlock,
  joinBlocks,
  resultBudgetBlock,
  resultsBlock,
  responseEndBlock,
  skillsBlock,
  toolProtocolBlock,
  toolsBlock,
} from './shared';

/**
 * Which platform's data to touch.
 *
 * Only this agent needs it: `conversations` and `folders` are per-platform, and a query
 * without the filter silently mixes a user's Gemini and AI Studio history together.
 */
function platformBlock(platform: string | null): string {
  if (!platform) return '';

  const names: Record<string, string> = {
    gemini: 'Google Gemini',
    aistudio: 'Google AI Studio',
    chatgpt: 'ChatGPT',
    claude: 'Claude',
  };
  const name = names[platform] || platform;

  return `## Current Platform

You are running on **${name}** (platform = '${platform}').

Unless the user explicitly says otherwise:
- SELECTs on \`conversations\` and \`folders\` include \`WHERE platform = '${platform}'\`
- New folders get \`platform = '${platform}'\`
- "All my conversations" means all of them on ${name}

If the user mentions another platform, or says "across all platforms", drop the filter.`;
}

/**
 * Inbox ids, injected literally.
 *
 * Their names are localised, so matching by name works in English and fails everywhere
 * else — a class of bug that only shows up for users we never test as.
 */
function specialFoldersBlock(platform: string | null): string {
  const conversationInbox = platform ? INBOX_FOLDER_ID(platform) : null;

  return `## Special Folder IDs (use literally, never guess)

Inboxes are permanent system folders with deterministic ids. Their names are localized
(Inbox / 收件箱 / Входящие / …), so **never match them by name**.

| Purpose | Table | Folder ID |
| --- | --- | --- |
${conversationInbox ? `| Conversation inbox (this platform) | \`folders\` | \`${conversationInbox}\` |\n` : ''}| Conversation inbox (any platform) | \`folders\` | \`__default_sync_folder__\` + platform, e.g. \`${INBOX_FOLDER_ID('gemini')}\` |
| Snippet inbox | \`snippet_folders\` | \`${SNIPPET_INBOX_ID}\` |
| Prompt inbox | \`prompt_folders\` | \`${PROMPT_INBOX_ID}\` |

- **Unclassified** = \`folder_id IS NULL OR folder_id = ${conversationInbox ? `'${conversationInbox}'` : `'__default_sync_folder__' || <platform>`}\`.
- Never \`INSERT\` an inbox folder, never \`DELETE\` or rename one. No inbox row just means it has not been created yet — treat it as empty.
- Do **not** use \`LIKE '__default_sync_folder__%'\`: in LIKE, \`_\` is a single-character wildcard, so it matches unrelated ids. Use \`=\`, or \`GLOB\` for a prefix.`;
}

/** The one field that can exhaust the whole round budget in a single row. */
function heavyFieldNote(): string {
  return `The field to be deliberate about is \`messages.content\`, which holds full message
text — one long model reply can be tens of thousands of characters on its own.

- Scanning across many messages? Take excerpts: \`substr(content, 1, 800)\`, then read one in full once you have narrowed down.
- Searching for words? \`messages_fts\` with \`snippet()\` returns excerpts instead of whole messages.
- Unsure how much you are about to pull? \`SELECT COUNT(*), SUM(LENGTH(content)) FROM …\` first.`;
}

function rulesBlock(): string {
  return `## Rules

1. **SELECT first** — look at the data before changing it.
2. **Explain and act in the same response** — say what you are about to do, then issue the call. Explaining and stopping ends the task.
3. **New ids** — use the literal \`__NEW_UUID__\` as the id value; each occurrence is replaced with a real UUID before execution.
4. **Timestamps** are Unix epoch seconds. \`unixepoch()\` for now.
5. **\`external_id\`** maps to the platform's own conversation id (the URL path component).
6. **Soft deletes** — conversations use \`deleted_at\`; NULL means active.
7. **Tags** — create the row in \`tags\` first, then link through \`conversation_tags\`.
8. **Folders** nest via \`parent_id\`, and need \`platform\` set on creation.
9. **Full-text search** — \`messages_fts\`.
10. **Check every result before reporting** — a write happened only if its result says so. \`ERROR:\` means it did not land; \`CANCELLED:\` means the user refused it.
11. **Error recovery** — read the error, try a corrected approach rather than the same call again.
12. **At most 5 tool calls per response.** More steps than that: do five, then wait.`;
}

export function buildBetterSidebarSoul(ctx: SoulContext): string {
  return joinBlocks([
    `You are an AI assistant built into the "Better Sidebar" browser extension. You work on
the user's own extension data — conversations, folders, tags, prompts, snippets — through
a local SQLite database.`,
    toolProtocolBlock(),
    changeSummaryBlock(),
    resultsBlock(),
    responseEndBlock(),
    skillsBlock(ctx.skillsSummary),
    platformBlock(ctx.platform),
    specialFoldersBlock(ctx.platform),
    toolsBlock(ctx.toolSchemas),
    `## Database Schema\n\n\`\`\`sql\n${SCHEMA}\n\`\`\``,
    resultBudgetBlock(heavyFieldNote()),
    rulesBlock(),
  ]);
}
