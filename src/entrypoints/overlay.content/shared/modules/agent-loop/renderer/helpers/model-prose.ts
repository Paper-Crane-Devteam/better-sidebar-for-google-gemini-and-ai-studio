/**
 * Splitting a model turn into the parts that get rendered: prose, and the tool cards
 * embedded in it.
 *
 * Two callers need the same split and must not disagree about it — the response
 * component, which renders the parts, and the session-end marker, which stays quiet
 * whenever the turn produced prose of its own (otherwise the completion summary
 * restates the paragraph it sits directly beneath). Deriving "did it say anything"
 * separately from "what does it say" is exactly the kind of pair that drifts, so
 * there is one function and the other is a question asked of its output.
 */

import { isHiddenTool } from '../constants';
import type { DisplayMessageTurn } from '../useConversationMessages';
import type { ExtractedToolCall } from './tool-parser';

export type TurnPart =
  | {
      kind: 'text';
      text: string;
      /** Last part of the turn, i.e. nothing follows it — margins go the other way */
      trailing: boolean;
    }
  | { kind: 'tool'; index: number; call: ExtractedToolCall }
  /**
   * A block the model is still writing. Its own kind rather than a flag on `tool`,
   * because the two render as different components and nothing that consumes a
   * settled call — approval binding, outcome lookup — applies to this one.
   */
  | { kind: 'pending-tool'; index: number; call: ExtractedToolCall };

/** Half-open `[start, end)` character range in the turn's raw text */
type Span = readonly [number, number];

/** Every ``` marker line in the text, as spans that include the trailing newline */
function fenceMarkers(text: string): Span[] {
  const spans: Span[] = [];
  const re = /^[ \t]*`{3,}[^\n]*\n?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
    // A zero-width match can't happen (the pattern needs three backticks), so no
    // lastIndex nudge is required.
  }
  return spans;
}

/**
 * The fence markers that only exist to carry a tool call, and go when it does.
 *
 * The protocol *requires* the ```text fence (see `prompts/souls/shared.ts`) — it is the
 * only channel the platform doesn't rewrite. So the common turn is a fence whose entire
 * body is a `<bs_agent_tool>` block, and lifting the block out on its own strands both
 * markers in the prose: the opener at the tail of one segment, the closer at the head of
 * the next.
 *
 * Which markers are stranded is a structural question, answered structurally: pair the
 * markers up in order, and drop both halves of any pair that contains a tool call. A real
 * code block the model wrote for the user contains no call, so it keeps its fences.
 *
 * This replaced a per-segment parity count, which could only ever strip *one* marker and
 * only when the segment's count was odd. Two orphans from two different blocks are an even
 * count, so they survived — and every shape that produces them is common: consecutive tool
 * calls (the closer of one plus the opener of the next land in the same segment), and a
 * hidden `complete_task`, whose span is swallowed without flushing so its own two markers
 * merge into the surrounding prose. Both rendered as an empty ```text code block.
 */
function strandedFences(text: string, calls: readonly ExtractedToolCall[]): Span[] {
  // Markers inside a call are not part of the document's fence structure — a `write_file`
  // payload can carry ``` in its content — and counting them would shift the pairing and
  // take a real code block's fences with it. They are inside a span that gets cut anyway.
  const markers = fenceMarkers(text).filter(
    ([start]) => !calls.some((c) => start >= c.startIndex && start < c.endIndex),
  );
  const dropped: Span[] = [];

  for (let i = 0; i < markers.length; i += 2) {
    const open = markers[i];
    const close = markers[i + 1];
    // An unclosed final fence runs to the end of the text, which is the live streaming
    // case: the fence is open because the call inside it is still being written.
    const bodyStart = open[1];
    const bodyEnd = close ? close[0] : text.length;
    const wrapsCall = calls.some((c) => c.startIndex >= bodyStart && c.endIndex <= bodyEnd);
    if (!wrapsCall) continue;
    dropped.push(open);
    if (close) dropped.push(close);
  }

  return dropped;
}

/**
 * `text[from, to)` with any stranded fence markers inside it removed.
 *
 * `dropped` is ordered and non-overlapping (it comes straight out of a left-to-right
 * scan), so one pass with a cursor is enough.
 */
function proseBetween(text: string, from: number, to: number, dropped: readonly Span[]): string {
  let out = '';
  let cursor = from;

  for (const [start, end] of dropped) {
    if (end <= from || start >= to) continue;
    if (start > cursor) out += text.slice(cursor, start);
    cursor = Math.max(cursor, Math.min(end, to));
  }

  if (cursor < to) out += text.slice(cursor, to);
  return out;
}

/**
 * Interleave the turn's prose with its visible tool calls, in reading order.
 *
 * Prose is buffered rather than emitted per tool call, so a hidden tool leaves no
 * seam: the text on either side of it merges back into one markdown part instead of
 * two with a gap where the card would have been. A hidden call still consumes its
 * span, or the raw `<bs_agent_tool>` block leaks into the markdown around it.
 *
 * Empty prose is dropped, which is why a turn that is nothing but a fenced tool block
 * yields no text part at all — the common shape, since models fence the tag far more
 * often than they narrate it.
 */
export function splitTurnContent(message: DisplayMessageTurn): TurnPart[] {
  const parts: TurnPart[] = [];

  let pending = '';
  const flush = (trailing: boolean) => {
    const text = pending;
    pending = '';
    if (!text.trim()) return;
    parts.push({ kind: 'text', text, trailing });
  };

  if (message.toolCalls.length === 0) {
    // displayText rather than rawText: for a user turn the two differ, and this stays
    // callable on one even though only model turns carry tool calls.
    pending = message.displayText;
    flush(true);
    return parts;
  }

  const dropped = strandedFences(message.rawText, message.toolCalls);

  let lastIndex = 0;
  message.toolCalls.forEach((call, index) => {
    pending += proseBetween(message.rawText, lastIndex, call.startIndex, dropped);
    lastIndex = call.endIndex;

    if (isHiddenTool(call.toolCall.name)) return;

    flush(false);
    // Swallowing the span matters more for a pending block than for a settled one:
    // what would leak is a JSON object cut off mid-value, growing a character at a
    // time in the middle of the prose.
    parts.push({ kind: call.pending ? 'pending-tool' : 'tool', index, call });
  });

  pending += proseBetween(message.rawText, lastIndex, message.rawText.length, dropped);
  flush(true);

  return parts;
}

/** Whether the turn says anything in its own words, beyond the tool calls it carries */
export function hasOwnProse(message: DisplayMessageTurn): boolean {
  if (message.role !== 'model') return false;
  return splitTurnContent(message).some((part) => part.kind === 'text');
}
