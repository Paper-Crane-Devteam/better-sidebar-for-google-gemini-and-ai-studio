/**
 * What the parser accepts — the tool vocabulary and each tool's required params.
 *
 * Kept separate from the parsing code because this is the list that grows: it is
 * the hook-in point for the MCP layer, which will eventually supply tool names and
 * schemas dynamically instead of these hardcoded tables.
 */

/** Maximum tool calls honoured in a single AI response */
import { BROWSER_TOOLS } from '@/shared/browser-agent/contracts';
import { WEB_READ_TOOLS, WEB_WRITE_TOOLS } from '@/shared/web-agent/contracts';

export const MAX_TOOL_CALLS = 20;

/**
 * The wrapper tag for tool calls. A custom HTML tag, so it survives Gemini's
 * markdown renderer and can't collide with Gemini's own `<tool_call>`.
 */
export const TOOL_TAG = 'bs_agent_tool';

/** Match transport Markdown escapes without rewriting payload text or source offsets. */
export const TOOL_OPEN_PATTERN = String.raw`\\?<bs\\?_agent\\?_tool>`;
export const TOOL_CLOSE_PATTERN = String.raw`\\?<\/bs\\?_agent\\?_tool>`;
export const TOOL_BLOCK_PATTERN = `${TOOL_OPEN_PATTERN}([\\s\\S]*?)${TOOL_CLOSE_PATTERN}`;

/** Tool names the engine can actually execute */
export const SUPPORTED_TOOLS = [
  ...BROWSER_TOOLS,
  // Web Agent page tools (see mcp/providers/web-provider.ts).
  ...WEB_READ_TOOLS,
  ...WEB_WRITE_TOOLS,
  'execute_sql',
  'sync_conversation_messages',
  'export',
  'open_new_chat',
  'complete_task',
  'activate_skill',
  // Workspace file tools (see mcp/workspace-mcp.ts). Listed here even when the
  // workspace server is disabled: the parser's job is to recognise the name, and
  // availability is the registry's call — `tool-registry.ts` answers a disabled
  // tool with CANCELLED, which tells the AI something useful. Dropping it at the
  // parser instead produces "unknown tool", which reads as a format error and
  // makes the model resend the whole response.
  'read_file',
  'write_file',
  'edit_file',
  'list_files',
  'glob_files',
  'grep_files',
  'manage_files',
  // Document tools (see mcp/document-mcp.ts). ⚠️ A tool missing from this list is
  // rejected here as "Unknown tool" no matter how correctly the prompt described it —
  // the schema reaches the model from the MCP registry, but the parser only trusts this
  // array. Adding a tool to a provider and not to this list ships a tool that can never
  // run.
  'doc_read',
  'doc_edit',
  // Theme tools (see mcp/theme-mcp.ts).
  'list_themes',
  'create_theme',
  'apply_theme',
] as const;

/** Params that must be present and non-empty, per tool */
export const REQUIRED_PARAMS: Record<string, string[]> = {
  browser_arrange_tabs: ['operations'],
  browser_close_tabs: ['operations'],
  browser_manage_tab_groups: ['operations'],
  browser_arrange_bookmarks: ['operations'],
  browser_delete_bookmarks: ['operations'],
  browser_restore_state: ['batch_id', 'side'],
  execute_sql: ['query'],
  sync_conversation_messages: ['conversation_ids'],
  // `format` is deliberately absent: omitting it is how the model says "the user
  // didn't specify", which makes the tool open the format picker instead.
  export: ['ids'],
  // `initial_prompt` is optional: without it the tool opens an empty chat.
  open_new_chat: [],
  complete_task: ['summary'],
  activate_skill: ['skill_id'],
  read_file: ['path'],
  // `content` is absent on purpose: an empty string is a legitimate file body, and
  // requiring it here would reject `write_file` calls that create a placeholder.
  write_file: ['path'],
  // `new_string` likewise — empty means "delete this text", which is a normal edit.
  edit_file: ['path', 'old_string'],
  // `list_files` with no path lists the workspace root, which is the common first call.
  list_files: [],
  glob_files: ['pattern'],
  grep_files: ['pattern'],
  manage_files: ['action'],
  // `mode` is absent on purpose: a path on its own means "give me the outline", which is
  // the correct first call on any document.
  doc_read: ['path'],
  doc_edit: ['path', 'ops'],
  // `list_themes` takes nothing at all.
  list_themes: [],
  create_theme: ['theme'],
  apply_theme: ['theme_id'],
  // Mirrors the `required` lists in mcp/providers/web-provider.ts.
  page_list: [],
  page_snapshot: [],
  page_open: ['url'],
  page_click: ['ref'],
  page_type: ['ref', 'text'],
  page_run_js: ['code'],
};

/**
 * Tools that steer the loop rather than doing work.
 *
 * `complete_task` just ends the session; there is nothing to allow or refuse, so it
 * is classified `control` (see `getToolRisk`) and skips the approval gate entirely
 * instead of being filed under `read` and inheriting the auto-run-reads switch.
 *
 * The list lives here, in the leaf schema module, so the policy layer and the
 * renderer can both read it without importing each other.
 */
export const CONTROL_TOOLS: readonly string[] = ['complete_task'];

/**
 * Tools that take the page away from us.
 *
 * `sync_conversation_messages` has no API to call: it navigates the tab through the
 * conversations it is recording, and the agent's own conversation is one of the pages
 * it leaves. So the loop cannot continue after one of these — there is no editor left
 * to type results into, and the AI gets no further turn.
 *
 * Treated as terminal on purpose rather than left to fail: without this the engine
 * would stage results and start waiting for a reply on a page that is being torn
 * down, which reads to the user as a hang.
 *
 * `open_new_chat` leaves this page intact but moves the user to a new tab, with the
 * next message sitting unsent in *that* composer. Nothing further is coming in this
 * conversation, so it ends the same way — and, like sync, must never be re-run by
 * auto-pickup after a reload (`hasUnrunToolWork`): that would open a second tab.
 */
export const HANDOFF_TOOLS: readonly string[] = ['sync_conversation_messages', 'open_new_chat'];

/** Opens a fresh chat in a new tab. Named for the UI, which previews its prompt. */
export const OPEN_NEW_CHAT_TOOL = 'open_new_chat';

/**
 * Tools that ask before running every time, whatever the user waved through earlier.
 *
 * `speedMode` ("don't ask again for this task") and `approveRestOfRound` are about the
 * task's own work. Opening a tab is a step out of the task, and its prompt is the thing
 * the user is meant to read — so it is asked about on its own.
 */
export const ALWAYS_ASK_TOOLS: readonly string[] = [OPEN_NEW_CHAT_TOOL];

/** Whether a successful call to this tool ends the session by navigating away */
export function isHandoffTool(name: string): boolean {
  return HANDOFF_TOOLS.includes(name);
}

/**
 * Params that exist for the user, not for the tool.
 *
 * `change_summary` is prose the AI writes so a person can decide whether to allow a
 * write. It has no effect on what runs, and it is freely reworded — so it must not
 * count towards "is this the same call as before".
 *
 * ⚠️ Two things break if it does. The circuit breaker compares whole param objects to
 * catch an AI stuck re-issuing one statement; a reworded summary makes each attempt
 * look new and the loop detector goes blind. And `buildToolCallKey` is written into the
 * conversation as a join key — varying prose would give the same effective call a
 * different key every time, so a card could no longer find its own result.
 */
export const NON_IDENTITY_PARAMS: readonly string[] = ['change_summary'];

/**
 * The params that decide what actually runs, with the human-facing ones removed.
 *
 * One helper for both consumers, so they cannot disagree about what identity means.
 */
export function identityParams(
  params: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(params)) {
    if (NON_IDENTITY_PARAMS.includes(key)) continue;
    out[key] = params[key];
  }
  return out;
}

/**
 * Whether this tool's result will ever be sent back to the AI.
 *
 * False for the two kinds that end the session on the spot: `complete_task` (the loop
 * stops, so there is no next turn to report into) and a handoff (the page is being
 * navigated away). Both push a section into the round's results, and that array is
 * then discarded along with the session — by design.
 *
 * Exists because the ledger has to know. It keeps a result body only while the AI is
 * still owed it, and treats a leftover body as "this ran but was never reported",
 * offering to send it. For these tools that offer is nonsense: it produced a card
 * asking whether to send the AI its own `__TASK_COMPLETE__` marker, one message after
 * the task had visibly finished.
 */
export function deliversResultToAI(name: string): boolean {
  return !CONTROL_TOOLS.includes(name) && !isHandoffTool(name);
}

/**
 * Whether the response looks cut off mid tool call.
 *
 * An unclosed opening tag is the one unambiguous signal, and it needs its own
 * branch: told "you forgot the tool format", the AI resends the whole response
 * from the top, which wastes a round and can re-run the first half.
 */
export function hasUnclosedToolBlock(responseText: string): boolean {
  // Only an open tag *after* the last close counts. Comparing totals misread a tag merely
  // mentioned in prose ("let me write the call using <bs_agent_tool>") as a cut-off
  // response, even though the real call after it was complete.
  const lastIndex = (pattern: string) =>
    [...responseText.matchAll(new RegExp(pattern, 'g'))].reduce((at, m) => m.index ?? at, -1);
  return lastIndex(TOOL_OPEN_PATTERN) > lastIndex(TOOL_CLOSE_PATTERN);
}

/**
 * The call inside a matched block: whatever follows the *last* open tag in it.
 *
 * The block regex is lazy from the first open tag, so a tag mentioned in prose before the
 * real call swallows the prose into the block and the JSON never parses. Pairing each close
 * with its nearest open is what the model meant.
 */
export function innermostToolBlock(block: string): string {
  const parts = block.split(new RegExp(TOOL_OPEN_PATTERN));
  return parts[parts.length - 1];
}

export function isSupportedTool(name: string): boolean {
  return (SUPPORTED_TOOLS as readonly string[]).includes(name);
}

/** Required params that `params` is missing */
export function findMissingParams(name: string, params: Record<string, string>): string[] {
  return (REQUIRED_PARAMS[name] || []).filter((p) => !params[p]);
}
