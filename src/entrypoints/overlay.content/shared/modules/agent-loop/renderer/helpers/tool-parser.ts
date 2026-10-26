/**
 * Tool call text parsing for the renderer.
 *
 * Delegates to the engine's parser rather than keeping a second implementation. The
 * copy that used to live here drifted: it did a plain `JSON.parse` with no repair
 * pass, so a block the engine could still salvage rendered as raw text — the user saw
 * a wall of JSON where a tool card belonged, and no approval button. Same input, same
 * verdict, in both places.
 */

import {
  SUPPORTED_TOOLS,
  TOOL_BLOCK_PATTERN,
  TOOL_CLOSE_PATTERN,
  TOOL_OPEN_PATTERN,
  innermostToolBlock,
} from '../../engine/parser/tool-schema';
import type { ParsedToolCall } from '../../types';
import { tryParseJson, tryParseUnstructured } from '../../engine/parser/fallbacks';

export interface ExtractedToolCall {
  toolCall: ParsedToolCall;
  rawText: string;
  matchString: string;
  startIndex: number;
  endIndex: number;
  /**
   * The block is still being written — an opening tag with no closing tag yet.
   *
   * Its `toolCall` is a sniff, not a parse: `params` is always empty and `name` is ''
   * until enough of the JSON has arrived to read one. Nothing may execute or key off a
   * pending call; it exists so the view can show a placeholder in the right place
   * instead of leaving a gap that fills in all at once when the turn ends.
   */
  pending: boolean;
}

/** Offset of the last open tag in a matched block (0 when there is only the one). */
function lastOpenOffset(block: string): number {
  let at = 0;
  for (const m of block.matchAll(new RegExp(TOOL_OPEN_PATTERN, 'g'))) at = m.index ?? at;
  return at;
}

/** Strip the `<bs_agent_tool>` wrapper if there is one */
function unwrap(text: string): string {
  const tagRegex = new RegExp(TOOL_BLOCK_PATTERN);
  const tagContent = text.match(tagRegex);
  return tagContent ? tagContent[1].trim() : text.trim();
}

/**
 * Parse a single tool call string or content block.
 */
export function parseToolCallFromText(text: string): ParsedToolCall | null {
  const content = unwrap(text);
  return tryParseJson(content) || tryParseUnstructured(content);
}

/**
 * Extract ALL tool calls from a response text, returning their parsed info and indices.
 *
 * `includePending` adds the block currently being written, when there is one. Only the
 * caller knows whether the turn is still streaming, and outside that case an unclosed
 * block means a *truncated* response rather than a live one — showing a placeholder that
 * never resolves would be worse than showing nothing.
 */
export function parseAllToolCallsFromText(
  text: string,
  options: { includePending?: boolean } = {},
): ExtractedToolCall[] {
  const tagRegex = new RegExp(TOOL_BLOCK_PATTERN, 'g');
  const results: ExtractedToolCall[] = [];
  let match: RegExpExecArray | null;
  let consumedTo = 0;

  while ((match = tagRegex.exec(text)) !== null) {
    consumedTo = match.index + match[0].length;
    // Same pairing as the engine (`innermostToolBlock`): start at the last open tag, so a
    // tag mentioned in prose before the call stays prose instead of joining the card.
    const startIndex = match.index + lastOpenOffset(match[0]);
    const fullMatch = text.slice(startIndex, consumedTo);
    const parsed = parseToolCallFromText(fullMatch);
    if (parsed) {
      results.push({
        toolCall: parsed,
        rawText: innermostToolBlock(match[1]).trim(),
        matchString: fullMatch,
        startIndex,
        endIndex: consumedTo,
        pending: false,
      });
    }
  }

  if (options.includePending) {
    const open = findPendingToolCall(text, consumedTo);
    if (open) results.push(open);
  }

  return results;
}

/**
 * The tool block still being written, or null.
 *
 * Looks only after the last *closed* block, so a completed call can never be reported
 * twice, and requires that no closing tag follows the opening one.
 *
 * ## Why the code-fence check is skipped here
 *
 * `parseToolCalls` ignores blocks inside a ``` fence, on the grounds that the model is
 * quoting a tool call rather than making one. That test cannot work mid-stream: a fence
 * wrapping a half-written block is necessarily still open, so every live call would look
 * fenced. The evidence that this one is real is its position — last in the text, with
 * nothing closing it, on a turn that is still arriving.
 *
 * The cost of being wrong is bounded and self-correcting: when the block closes, the
 * ordinary rules apply and a genuinely quoted one drops out.
 */
function findPendingToolCall(text: string, from: number): ExtractedToolCall | null {
  const openRegex = new RegExp(TOOL_OPEN_PATTERN, 'g');
  openRegex.lastIndex = from;
  const open = openRegex.exec(text);
  if (!open) return null;

  const after = text.slice(open.index + open[0].length);
  if (new RegExp(TOOL_CLOSE_PATTERN).test(after)) return null;

  return {
    toolCall: { name: sniffToolName(after), description: sniffDescription(after), params: {} },
    rawText: after.trim(),
    matchString: text.slice(open.index),
    startIndex: open.index,
    endIndex: text.length,
    pending: true,
  };
}

/**
 * The tool name out of a half-written block, once it is there and recognised.
 *
 * Checked against `SUPPORTED_TOOLS` rather than taken as read: the value arrives one
 * character at a time, so an unguarded read shows `wr`, then `write`, then `write_file`
 * — a label visibly typing itself, which reads as a glitch. Requiring a known name means
 * the card shows a generic placeholder and then the real label, once.
 *
 * Tolerates `write\_file`, which is what the DOM fallback path yields when the platform's
 * markdown renderer has escaped the underscore.
 */
function sniffToolName(partial: string): string {
  const match = /"name"\s*:\s*"([a-zA-Z0-9_\\]+)"/.exec(partial);
  if (!match) return '';
  const name = match[1].replaceAll('\\_', '_');
  return (SUPPORTED_TOOLS as readonly string[]).includes(name) ? name : '';
}

/**
 * The description out of a half-written block, once the closing quote has arrived.
 *
 * Only a complete value is used — a description that grows character by character is the
 * same glitchy effect as the name, and this one is a whole sentence.
 */
function sniffDescription(partial: string): string | undefined {
  const match = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(partial);
  if (!match) return undefined;
  const value = match[1].replaceAll('\\"', '"').trim();
  return value || undefined;
}

/**
 * Extract display info (toolName, description, query) from tool call text.
 *
 * `query` is whatever this call's headline param is — the SQL, the summary, or the id
 * list — since that is the one line the card shows before you expand it.
 */
export function extractToolInfo(text: string): {
  toolName: string;
  description: string;
  query: string;
  /**
   * The AI's plain-language account of what a write will change, when it gave one.
   *
   * Separate from `description`, which is a one-line label for the step. This is the
   * text the approval decision is actually made on — see `sql-provider`'s schema.
   */
  changeSummary: string;
} {
  const parsed = parseToolCallFromText(text);
  if (!parsed) return { toolName: 'tool_call', description: '', query: '', changeSummary: '' };

  const { params } = parsed;
  return {
    toolName: parsed.name || 'unknown',
    description: parsed.description || '',
    query: params.query || params.summary || params.conversation_ids || params.ids || '',
    changeSummary: (params.change_summary || '').trim(),
  };
}
