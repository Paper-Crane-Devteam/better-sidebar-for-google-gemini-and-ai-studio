/**
 * Execution policy — decides which tool calls need the user's go-ahead, and as a
 * direct consequence, who presses send at the end of the round.
 *
 * One question, asked per call: may this run without asking? Four inputs, checked
 * from broadest to narrowest:
 *
 * 1. `speedMode`          — approved everything for this task (session)
 * 2. `approveRestOfRound` — approved the rest of this response (cleared each round)
 * 3. `autoRunWrites`      — changes to data run by themselves (persisted, off)
 * 4. `autoRunReads`       — queries run by themselves (persisted, on)
 *
 * The gate itself lives in the engine (`stages/approval-gate.ts`), not in the tools.
 * `execute-sql` used to ask for its own confirmation, which meant a tool reaching
 * into the UI and left the request with no way to say *which* call it was about —
 * so the approval couldn't be offered on the tool card in the chat.
 */

import type { ParsedToolCall, ToolRisk } from './types';
import { isBrowserTool, isBrowserWrite } from '@/shared/browser-agent/contracts';
import { isWebTool, isWebWrite } from '@/shared/web-agent/contracts';
import { useAgentLoopStore } from './agent-loop-store';
import { useAgentPolicyStore } from './agent-policy-store';
import {
  ALWAYS_ASK_TOOLS,
  CONTROL_TOOLS,
  identityParams,
  isHandoffTool,
} from './engine/parser/tool-schema';

// ─── Approval ────────────────────────────────────────────────────────────────

/** Whether this tool steers the loop instead of doing work */
export function isControlTool(toolName: string): boolean {
  return CONTROL_TOOLS.includes(toolName);
}

/**
 * Which switch governs this call — or none at all.
 *
 * Three answers, and the third is the point of the function existing rather than a
 * plain `isWrite` boolean:
 *
 * - `control` — the call does nothing to the data, it ends the loop. Filing
 *   `complete_task` under `read` meant "don't auto-run queries" also meant "ask me
 *   before finishing", which is a gate over an operation with no downside and no
 *   alternative: refusing it just makes the AI say the same thing again next round.
 * - `write`   — SQL that modifies data. Only that: `export` produces output but leaves
 *   the database alone, so gating it behind the write switch would train people to
 *   turn it on.
 * - `read`    — everything else.
 *
 * `sync_conversation_messages` sits awkwardly across this: it records messages, but
 * through the extension's normal capture path rather than SQL the user could read
 * first. It is handled by name in `requiresApproval` instead — see there.
 */
export function getToolRisk(toolCall: ParsedToolCall): ToolRisk {
  if (isBrowserTool(toolCall.name)) return isBrowserWrite(toolCall.name) ? 'write' : 'read';
  if (isWebTool(toolCall.name)) return isWebWrite(toolCall.name) ? 'write' : 'read';
  if (isControlTool(toolCall.name)) return 'control';
  if (WORKSPACE_WRITE_TOOLS.includes(toolCall.name)) return 'write';
  if (WORKSPACE_READ_TOOLS.includes(toolCall.name)) return 'read';
  if (toolCall.name !== 'execute_sql') return 'read';
  const sql = (toolCall.params.query || '').trim().toUpperCase();
  return /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)/.test(sql) ? 'write' : 'read';
}

/**
 * Workspace tools that change files, and so answer to the write switch.
 *
 * `manage_files` is here on the strength of its worst action: it takes `action` as a
 * runtime param, and `delete` with `recursive` removes a subtree with no undo. Risk
 * is what the user is deciding about, so it is classified by what the call *could*
 * do, not by parsing the param to find out that this particular one is an `mkdir`.
 *
 * Exported because the file panel needs the same list to know when what it is showing
 * has gone stale (see `agent-tab/workspace/useWorkspaceRevision`). Keeping one list
 * means a tool added here cannot be gated for approval and then forgotten by the tree.
 */
export const WORKSPACE_WRITE_TOOLS: readonly string[] = [
  'write_file',
  'edit_file',
  'manage_files',
  // `doc_edit` rewrites a binary container. It keeps a copy under `.history/` and verifies
  // what it wrote, but the thing at stake is a file the user cannot repair by hand if it
  // lands wrong — so it belongs on the same switch as the other writes, not below them.
  'doc_edit',
];

/** Workspace tools that only look at files. */
const WORKSPACE_READ_TOOLS: readonly string[] = [
  'read_file',
  'list_files',
  'glob_files',
  'grep_files',
  'doc_read',
];

/** Whether a tool call is a database write operation */
export function isWriteOperation(toolCall: ParsedToolCall): boolean {
  return getToolRisk(toolCall) === 'write';
}

/** Whether this call must wait for the user before it runs */
export function requiresApproval(toolCall: ParsedToolCall): boolean {
  if (isBrowserTool(toolCall.name)) return isBrowserWrite(toolCall.name);
  const risk = getToolRisk(toolCall);
  // Outside the switches by construction — there is no operation here to approve.
  if (risk === 'control') return false;

  // Ahead of the blanket approvals on purpose — see ALWAYS_ASK_TOOLS.
  if (ALWAYS_ASK_TOOLS.includes(toolCall.name)) return true;

  const { speedMode, approveRestOfRound } = useAgentLoopStore.getState();
  if (speedMode || approveRestOfRound) return false;

  // Page actions ignore the standing "auto-run writes" switch. That switch was turned on for
  // SQL against the user's own data; a click on a stranger's page under their login is a
  // different risk, and only an approval given in this task may waive it.
  if (isWebTool(toolCall.name) && isWebWrite(toolCall.name)) return true;

  // A handoff takes the tab away for minutes and ends the session (see HANDOFF_TOOLS).
  // Neither switch fits: it isn't a SQL write, and the read switch is on by default,
  // which would let the browser wander off mid-sentence with no click involved.
  if (isHandoffTool(toolCall.name)) return true;

  const { autoRunReads, autoRunWrites } = useAgentPolicyStore.getState();
  return risk === 'write' ? !autoRunWrites : !autoRunReads;
}

// ─── Who presses send ────────────────────────────────────────────────────────

/**
 * Whether the engine should send this round's results back by itself.
 *
 * Two independent inputs, intersected — both have to say yes:
 *
 * 1. `autoContinue` — a standing preference. "Let it run unattended." Someone who
 *    wants to watch each step before letting it continue turns this off, and does
 *    not thereby have to confirm every individual SELECT.
 * 2. The round itself — did anything here already stop and ask? A user who just
 *    approved a statement is sitting right there, so the send is theirs. Having it
 *    fly off the moment you clicked "Run" is the worse surprise; one extra keypress
 *    is the cheaper half of that trade.
 *
 * A response commonly mixes both kinds — two SELECTs and an UPDATE — and there is
 * only one send, so it goes to the user if *any* call needed them.
 * `approveRestOfRound` and `speedMode` fold in for free, since they make
 * `requiresApproval` false for the rest of the round.
 *
 * ⚠️ Intersection, not replacement. `autoSend = autoContinue` on its own lets the
 * switch contradict the approval gate; this way the switch can only ever make
 * things *more* manual.
 */
export function shouldAutoSend(toolCalls: ParsedToolCall[]): boolean {
  if (!isUnattendedAllowed()) return false;
  return !toolCalls.some((call) => requiresApproval(call));
}

/**
 * The standing preference on its own, for payloads that aren't tool results.
 *
 * The format nudge is ours, not something the user vetted, so there is no round to
 * inspect — but "off means I press Enter every time" has to hold for it too, or the
 * switch stops being predictable.
 */
export function isUnattendedAllowed(): boolean {
  return useAgentPolicyStore.getState().autoContinue;
}

// ─── Identity ────────────────────────────────────────────────────────────────

/**
 * Stable identity for a tool call: same tool + same params = same fingerprint.
 *
 * Lets the card in the chat find the call it is showing — both to light up when the
 * approval is about it, and to report afterwards what became of it. Params are
 * key-sorted and whitespace-normalised so cosmetic differences in the AI's
 * formatting don't produce a different fingerprint.
 */
export function buildToolCallFingerprint(toolCall: ParsedToolCall): string {
  if (isBrowserTool(toolCall.name)) {
    // Browser labels and URLs are exact values: whitespace inside a string matters.
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
    const params = identityParams(toolCall.params);
    let operations: unknown = params.operations;
    try { if (params.operations) operations = JSON.parse(params.operations); } catch { /* Validation reports malformed JSON later. */ }
    return `${toolCall.name}(${JSON.stringify(canonical({ ...params, ...(operations !== undefined ? { operations } : {}) }))})`;
  }
  // `identityParams` drops the human-facing ones (`change_summary`): they are reworded
  // freely and would give the same effective call a different fingerprint each time,
  // which the join key written into the conversation cannot tolerate.
  const source = identityParams(toolCall.params);
  const params = Object.keys(source)
    .sort()
    .map((key) => `${key}=${(source[key] ?? '').replace(/\s+/g, ' ').trim()}`)
    .join('&');
  return `${toolCall.name}(${params})`;
}

/**
 * The same identity, short enough to travel inside a message.
 *
 * A fingerprint carries the whole SQL statement, so it cannot be written into the
 * results we send back to the AI. This is its digest: ten hex characters, which is
 * ample when the only thing it has to be unique across is the tool calls of one
 * conversation.
 *
 * Why a digest of the fingerprint rather than a random id minted per call: the card
 * in the chat has to find its own record, and a random id would only exist in our
 * database — a dangling pointer as soon as you open the conversation on another
 * machine, or after a restore that didn't carry these tables. A digest is
 * self-describing. The card recomputes it from the call it is already rendering and
 * matches on that, so the conversation alone is enough.
 *
 * ⚠️ It follows that `buildToolCallFingerprint` is now a *wire* format: change how it
 * normalises params and every key already written into a conversation stops matching.
 * `deriveToolOutcomes` falls back to its heuristic in that case, so the failure is
 * graceful rather than silent — but it is still a one-way door.
 *
 * Synchronous on purpose: `crypto.subtle.digest` is async, and this is called during
 * render. FNV-1a twice with different offset bases is not cryptography, and does not
 * need to be — nothing security-relevant rests on it, only which card lights up.
 */
export function buildToolCallKey(toolCall: ParsedToolCall): string {
  return digest(buildToolCallFingerprint(toolCall));
}

/** Length of the hex digest `buildToolCallKey` emits */
export const TOOL_CALL_KEY_LENGTH = 10;

function digest(input: string): string {
  const a = fnv1a(input, 0x811c9dc5);
  const b = fnv1a(input, 0x01000193);
  return (
    a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
  ).slice(0, TOOL_CALL_KEY_LENGTH);
}

function fnv1a(input: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32-bit territory; `hash * 16777619` would
    // drift into float precision and stop being a hash after a few characters.
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
