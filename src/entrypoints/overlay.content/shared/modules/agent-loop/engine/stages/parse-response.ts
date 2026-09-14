/**
 * Stage ② — turn the AI's text into tool calls, or decide the session is over.
 *
 * The important rule lives here: **a response with no tool calls is not
 * completion.** The protocol ends with `complete_task`, so silence means the AI
 * either drifted into prose or lost the format. Treating it as success is what once
 * made a session announce "Task finished" on round 1 without doing anything.
 *
 * But it isn't something to argue with either. Gemini only answers when it is sent
 * something, and stage ④ only sends when there are results — so "do nothing and
 * carry on" would leave stage ① waiting out its timeout on a turn that is never
 * coming. There is exactly one honest move: end the session and say why.
 *
 * The one exception is a response that *tried* to call a tool and produced garbage:
 * an unclosed block (the stream got cut) or JSON that won't parse. That is an
 * accident rather than a decision, so the breaker grants one retry per session.
 */

import {
  selectSettledAnswer,
  useModelStreamStore,
} from '@/shared/lib/model-stream-store';
import type { ParsedToolCall } from '../../types';
import type { LoopContext } from '../context';
import { parseToolCalls, hasUnclosedToolBlock } from '../parser';

export type ParseOutcome =
  /** Normal path — hand these to stage ③ */
  | { kind: 'tool-calls'; toolCalls: ParsedToolCall[]; errors: string[] }
  /** A malformed block got its one retry — send this back to get a clean response */
  | { kind: 'nudge'; text: string }
  /** Nothing to run and nothing to send; the session is already ended */
  | { kind: 'stalled' };

export function parseResponse(ctx: LoopContext, responseElement: HTMLElement): ParseOutcome {
  ctx.setStatus('parsing');

  const { text: responseText, source } = readResponseText(ctx, responseElement);
  const { toolCalls, errors } = parseToolCalls(responseText);

  console.log(
    `[AgentLoop] Parsing response from ${source}, length:`,
    responseText.length,
  );
  console.log(`[AgentLoop] Found ${toolCalls.length} tool calls, ${errors.length} errors`);

  ctx.events.emit('ai:response-received', {
    textLength: responseText.length,
    toolCallCount: toolCalls.length,
  });

  if (toolCalls.length > 0) {
    return { kind: 'tool-calls', toolCalls, errors };
  }

  // A block was attempted but came out unusable — worth one more try.
  const truncated = hasUnclosedToolBlock(responseText);

  if (truncated || errors.length > 0) {
    if (ctx.breaker.claimFormatRetry()) {
      console.log(
        `[AgentLoop] Malformed tool block (${truncated ? 'truncated' : 'unparseable'}), nudging once`,
      );
      return {
        kind: 'nudge',
        text: ctx.breaker.getFormatGuidance(truncated ? 'truncated' : 'unparseable', errors),
      };
    }

    console.log('[AgentLoop] Format retry budget spent, ending session');
    ctx.finish('no_tool_call');
    return { kind: 'stalled' };
  }

  // Plain prose. Nothing to execute, nothing to send — end here rather than wait on
  // a turn that cannot arrive.
  //
  // `finish`, not `pause`: pausing offers Retry, and retrying would re-enter stage ①
  // to wait out its timeout on that same absent turn.
  console.log('[AgentLoop] No tool calls in the response, ending session');
  ctx.finish('no_tool_call');
  return { kind: 'stalled' };
}

/**
 * The model's reply — from the API stream when we can have it, from the DOM when we
 * can't.
 *
 * ## Why the stream is preferred
 *
 * Both platforms run the reply through a CommonMark renderer before it reaches the
 * document, and a renderer consumes its own syntax. Measured on live captures: `\"`
 * arrives as `"`, `\\` as `\`, `*a*` as `a`; on Gemini raw HTML tags are dropped
 * outright and URLs are swapped for link components. A `write_file` whose content is
 * itself JSON therefore fails `JSON.parse` — 11 of 15 calls in one real session — and
 * the ones that still parse can be silently corrupted, which is worse: a
 * `tailwind.config.js` arrived with the asterisk closing its block comment eaten, and a
 * glob of `**` + `/` + `*.{js,ts}` reduced to `**` + `/` + `.{js,ts}`. Both were written
 * to disk that way.
 *
 * It is not only about parsing. `buildToolCallKey` digests a call's params, and the card
 * in the chat computes it independently from the *store's* copy of the same turn. While
 * the engine read the DOM the two digests disagreed, so a call could run and still
 * report "Not run". Reading one source fixes the cards as a side effect.
 *
 * ## Why the DOM stays
 *
 * The stream formats are Google's private wire protocols, addressed by array index.
 * They change. If a reader stops recognising its payload the answer here is a degraded
 * agent, not a dead one — so `extractLiteralResponseText` and the escape tolerance in
 * the parser are still in place, just no longer on the default path.
 *
 * The element is still what stage ① hands over and still what proves *which* turn
 * finished; the stream only supplies better bytes for it.
 */
function readResponseText(
  ctx: LoopContext,
  responseElement: HTMLElement,
): { text: string; source: 'api stream' | 'DOM' } {
  const stream = useModelStreamStore.getState();
  const streamed = selectSettledAnswer(stream, ctx.streamBoundary);

  if (streamed) {
    // Enough to tell a bad read from a bad response in one line. A stream shorter than
    // the DOM copy means the reader is losing tail, which looks identical to the model
    // truncating its own answer — and the two want opposite fixes.
    const domLength = ctx.adapter.extractResponseText(responseElement).length;
    console.log(
      `[AgentLoop] Response source=api stream chars=${streamed.length} ` +
        `domChars=${domLength} unclosedBlock=${hasUnclosedToolBlock(streamed)}`,
    );
    return { text: streamed, source: 'api stream' };
  }

  console.warn(
    '[AgentLoop] No settled stream for this turn — falling back to the rendered DOM, ' +
      'which loses backslash escapes and markdown delimiters. ' +
      `streamId=${stream.streamId} boundary=${ctx.streamBoundary} ` +
      `finished=${stream.finished} answerChars=${stream.answer.length}`,
  );
  return { text: ctx.adapter.extractResponseText(responseElement), source: 'DOM' };
}
