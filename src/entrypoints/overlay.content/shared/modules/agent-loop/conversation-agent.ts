/**
 * Which agent a conversation is running as, recovered after the engine is gone.
 *
 * ## Why this has to be recoverable at all
 *
 * `activeAgentId` lives in the runtime store, so a reload takes it with it. Every path
 * that starts a session *without* the user picking an agent — auto-pickup, owed-result
 * delivery — therefore has to work the answer out again, and the tool layer refuses
 * anything the resolved agent doesn't own. Getting it wrong is not a soft failure: a
 * Workspace conversation resumed as Better Sidebar is told its own file tools belong to
 * someone else, on tools it used successfully a round earlier.
 *
 * ## The transcript is the source, not the ledger
 *
 * `[#bs-agent:<id>#]` sits in the first message of every agent session, forever — it is
 * wire format (see `agents/types.ts`). So the answer is already written down in the one
 * place that survives reloads, conversation switches and reopening the chat next week.
 * The ledger deliberately holds "only what cannot be recovered from the transcript"
 * (`db/operations/agentRuns.ts`), and this can be, so it does not belong there.
 *
 * ## Two probes, no platform branch
 *
 * The marker is read from whichever source has it, newest message first:
 *
 * 1. `conversation-messages-store` — fed by the API interceptor, and the *only* complete
 *    source on AI Studio, whose transcript is virtualised.
 * 2. Gemini's `<user-query>` elements — every turn is in the document there.
 *
 * Both are tried and the first hit wins. There is no `detectPlatform()` call because
 * none is needed: the store is empty of user turns where it isn't populated, and
 * `user-query` does not exist outside Gemini. Two honest probes beat a branch that has
 * to be kept in step with which platform stores what.
 */

import { extractPromptId } from './renderer/constants';
import { agentIdFromEntry } from './agent-entry';
import { mcpRegistry } from './mcp/registry';
import type { AgentId } from './agents/types';
import { useConversationMessagesStore } from '@/shared/lib/conversation-messages-store';

/** User-message texts in the open conversation, newest first. */
function userTexts(): string[] {
  const texts: string[] = [];

  for (const message of useConversationMessagesStore.getState().messages) {
    if (message.role === 'user' && message.content) texts.push(message.content);
  }

  document.querySelectorAll('user-query').forEach((el) => {
    const text = el.textContent;
    if (text) texts.push(text);
  });

  // Newest first: a conversation may have run several sessions, and the agent in force
  // is the one the most recent launch chose.
  return texts.reverse();
}

/**
 * The agent named by the newest `[#bs-agent:…#]` marker, or null if there is none.
 *
 * Null means "this conversation has no agent history to read", not "Better Sidebar" —
 * the caller decides what to do with that, because defaulting here would hide the
 * difference between a recovered answer and a guess.
 */
export function agentFromTranscript(): AgentId | null {
  for (const text of userTexts()) {
    const promptId = extractPromptId(text);
    // `agentIdFromEntry` maps legacy ids (`__agent_auto__`, `builtin-workspace-agent`)
    // onto real agents, which is why old conversations resolve rather than failing.
    if (promptId) return agentIdFromEntry(promptId);
  }
  return null;
}

/**
 * The agent a reconstructed session should run as.
 *
 * ⚠️ The order matters, and it is not the obvious one. The marker wins over the tool
 * names even though the names look like more direct evidence, because the marker records
 * which agent's prompt is actually in the model's context — so a Better Sidebar session
 * that somehow emitted `glob_files` should still be refused, not promoted. The tool names
 * are the fallback for a conversation whose marker cannot be read at all.
 *
 * The fallback is not redundant, and neither is the marker. The bug that motivated this
 * pair: a Workspace conversation was reloaded, the user asked it to keep editing, and the
 * model's whole response was a single `activate_skill` — which lives on the *shared*
 * server and so names no agent. Tool names alone resolved to nothing and the session ran
 * as the default, which then refused the Workspace skill it had just been asked for.
 *
 * @param toolNames Tools in the response or rows being replayed. May be empty.
 */
export function resolveAgentForRecoveredSession(
  toolNames: readonly string[],
): AgentId | undefined {
  return agentFromTranscript() ?? mcpRegistry.agentForTools(toolNames) ?? undefined;
}
