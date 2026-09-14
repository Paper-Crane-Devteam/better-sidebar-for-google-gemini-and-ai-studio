/**
 * Reading "the task ended here" out of the conversation.
 *
 * The end marker used to be drawn from the runtime store's `endReason`, which a
 * reload wipes, the next `start()` clears, and which isn't scoped to a conversation
 * at all — so the marker vanished while the transcript still plainly ended with a
 * `complete_task` call, and followed the user onto other chats that happened to have
 * agent content.
 *
 * The call itself is the record: it sits in the model turn in the DOM. Present means
 * the task ended, absent means it didn't. Nothing else to keep in sync.
 *
 * The status mapping mirrors `engine/stages/execute-tools.ts`: anything that isn't
 * "infeasible" reads as a completion, including a missing or misspelt status, for the
 * same reason `completeTask` defaults that way — a typo shouldn't turn a finished
 * task into a failed one.
 */

import { deliversResultToAI, isHandoffTool } from '../../engine/parser/tool-schema';
import type { DisplayMessageTurn } from '../useConversationMessages';

/** The tool whose presence in a turn means the session ended there */
const COMPLETION_TOOL = 'complete_task';

/** How the task ended, as the AI reported it */
export type SessionOutcome = 'complete' | 'partial' | 'infeasible';

export interface SessionEnd {
  outcome: SessionOutcome;
  /**
   * What the AI said it did — its `summary` argument, verbatim.
   *
   * Read from the call because there is nowhere else left to read it from. The engine
   * files the summary into the runtime store's `history`, but the card that renders it
   * only appears for an `infeasible` verdict, and the dock hides itself entirely on a
   * clean finish (`finishedNeedsAttention`) — so on the happy path the AI wrote a
   * paragraph that nothing on screen ever showed. Taken from the DOM it also survives a
   * reload and a conversation reopened next week, which the store never could.
   *
   * Empty string when the call carried no summary (a malformed call the tool itself
   * would have rejected).
   */
  summary: string;
}

/**
 * `params.status` → what we show. Mirrors `completeTask`'s tolerance on purpose: an
 * unrecognised value reads as plain success there, and the two must not disagree about
 * the same call.
 */
function readOutcome(status: string | undefined): SessionOutcome {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'infeasible':
      return 'infeasible';
    case 'partial':
      return 'partial';
    default:
      return 'complete';
  }
}

/**
 * Whether this turn closes a task, how it went, and what it says it did. `null` for
 * anything else.
 *
 * Scans from the back: a response is capped at five tool calls and the completion is
 * meant to be the last of them, so the final one is the verdict if the AI ever
 * repeats itself.
 */
export function readSessionEnd(message: DisplayMessageTurn): SessionEnd | null {
  if (message.role !== 'model') return null;

  for (let i = message.toolCalls.length - 1; i >= 0; i--) {
    const call = message.toolCalls[i].toolCall;
    if (call.name !== COMPLETION_TOOL) continue;
    return {
      outcome: readOutcome(call.params.status),
      summary: (call.params.summary ?? '').trim(),
    };
  }

  return null;
}

/**
 * Whether this turn is holding tool calls that still want running.
 *
 * The question auto-pickup asks of the newest response, and it is narrower than "did
 * this turn end a session", which is what it used to ask. The two come apart on the
 * shape the AI produces most often of all: work *and* `complete_task` in one response
 * (see the completion branch in `engine/stages/execute-tools.ts`, which exists because
 * of exactly this habit). Read as a session ending, that turn was skipped whole — so a
 * follow-up question after a finished task got an answer whose statements nothing ever
 * executed, no results, and a tick saying the task was done. Judging it per call
 * instead, the completion is ignored and the work underneath it still gets picked up.
 *
 * Two kinds of call are not work:
 *
 * `complete_task` is bookkeeping. Its result is never sent back, so its outcome stays
 * `null` for good — which reads as "nobody ran this" forever. A turn that is nothing
 * but a completion therefore used to spin up a session that re-parsed the completion
 * and immediately ended again, leaving a stray summary card behind.
 *
 * A handoff tool is worse than not-work: it navigated the tab away (see
 * `HANDOFF_TOOLS`), so its outcome is permanently `null` for the same reason, and
 * running it again re-books the tab for the entire sync road trip — which is what
 * greeted the user on getting back from the first one. One anywhere in the turn
 * disqualifies the whole turn, because pickup re-executes a response as a unit and
 * cannot take the statements without the handoff.
 */
export function hasUnrunToolWork(
  // Narrowed to what it reads, so a platform that can only see one turn (AI Studio
  // virtualises the rest away) can still ask this question.
  message: Pick<DisplayMessageTurn, 'role' | 'toolCalls'>,
): boolean {
  if (message.role !== 'model') return false;
  if (message.toolCalls.some((call) => isHandoffTool(call.toolCall.name))) return false;
  return message.toolCalls.some((call) => deliversResultToAI(call.toolCall.name));
}
