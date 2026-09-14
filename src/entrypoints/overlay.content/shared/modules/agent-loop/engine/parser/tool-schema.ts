/**
 * What the parser accepts — the tool vocabulary and each tool's required params.
 *
 * Kept separate from the parsing code because this is the list that grows: it is
 * the hook-in point for the MCP layer, which will eventually supply tool names and
 * schemas dynamically instead of these hardcoded tables.
 */

/** Maximum tool calls honoured in a single AI response */
import { BROWSER_TOOLS } from '@/shared/browser-agent/contracts';

export const MAX_TOOL_CALLS = 20;

/**
 * The wrapper tag for tool calls. A custom HTML tag, so it survives Gemini's
 * markdown renderer and can't collide with Gemini's own `<tool_call>`.
 */
export const TOOL_TAG = 'bs_agent_tool';

/** Tool names the engine can actually execute */
export const SUPPORTED_TOOLS = [
  ...BROWSER_TOOLS,
  'execute_sql',
  'sync_conversation_messages',
  'export',
  'complete_task',
  'activate_skill',
] as const;

/** Params that must be present and non-empty, per tool */
export const REQUIRED_PARAMS: Record<string, string[]> = {
  browser_update_tabs: ['operations'],
  browser_manage_tab_groups: ['operations'],
  browser_manage_bookmarks: ['operations'],
  browser_undo_changes: ['batch_id'],
  execute_sql: ['query'],
  sync_conversation_messages: ['conversation_ids'],
  // `format` is deliberately absent: omitting it is how the model says "the user
  // didn't specify", which makes the tool open the format picker instead.
  export: ['ids'],
  complete_task: ['summary'],
  activate_skill: ['skill_id'],
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
 */
export const HANDOFF_TOOLS: readonly string[] = ['sync_conversation_messages'];

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
  const opens = responseText.split(`<${TOOL_TAG}>`).length - 1;
  const closes = responseText.split(`</${TOOL_TAG}>`).length - 1;
  return opens > closes;
}

export function isSupportedTool(name: string): boolean {
  return (SUPPORTED_TOOLS as readonly string[]).includes(name);
}

/** Required params that `params` is missing */
export function findMissingParams(name: string, params: Record<string, string>): string[] {
  return (REQUIRED_PARAMS[name] || []).filter((p) => !params[p]);
}
