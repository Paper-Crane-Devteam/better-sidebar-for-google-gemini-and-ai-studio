/**
 * Tool Call Parser — AI response text in, executable tool calls out.
 *
 * Expected format — a fenced block, because that is the only channel the platform does
 * not rewrite (see `toolProtocolBlock`):
 *
 * ```text
 * <bs_agent_tool>
 * {"name":"execute_sql","description":"查询对话列表","params":{"query":"SELECT * FROM conversations LIMIT 10"}}
 * </bs_agent_tool>
 * ```
 *
 * ## Fenced calls are real calls
 *
 * ⚠️ This used to skip any block sitting inside a ``` fence, on the reasoning that the AI
 * was *quoting* a call rather than making one. That rule is now wrong twice over and its
 * removal is deliberate.
 *
 * It was only ever harmless by accident: the text came from the DOM, and
 * `extractLiteralResponseText` does not restore fence markers, so no block ever looked
 * fenced. Reading the API stream instead (see `parse-response`) put the real ``` markers
 * into the text — at which point a model that fenced its own call, which they do far more
 * often than they narrate one, had it silently dropped and the session ended as "no tool
 * calls".
 *
 * And now the protocol *requires* the fence, so "inside a fence" cannot possibly mean
 * documentation any more.
 *
 * The guard is not replaced. A model turn that quotes a tool call it does not want run
 * will now have it run — accepted, because the prompt's own examples live in *user*
 * messages, which are never parsed for calls (see `turn-assembly`), and because every
 * write still passes the approval gate.
 *
 * Pure and stateless. Everything it rejects comes back as an `errors` entry rather
 * than an exception, because those strings are fed back to the AI so it can fix
 * its own output on the next round.
 *
 * - `tool-schema.ts` — which tools exist and what they require
 * - `fallbacks.ts`   — coping with Gemini mangling the format
 */

import type { ParsedToolCall, ParseResult } from '../../types';
import { MAX_TOOL_CALLS, TOOL_BLOCK_PATTERN, findMissingParams, innermostToolBlock, isSupportedTool } from './tool-schema';
import { describeJsonFault, tryParseJson, tryParseUnstructured } from './fallbacks';

export {
  TOOL_TAG,
  SUPPORTED_TOOLS,
  REQUIRED_PARAMS,
  CONTROL_TOOLS,
  hasUnclosedToolBlock,
} from './tool-schema';

const TOOL_BLOCK_RE = new RegExp(TOOL_BLOCK_PATTERN, 'g');

/** Parse every tool call in an AI response. */
export function parseToolCalls(responseText: string): ParseResult {
  const toolCalls: ParsedToolCall[] = [];
  const errors: string[] = [];

  const regex = new RegExp(TOOL_BLOCK_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(responseText)) !== null) {
    if (toolCalls.length >= MAX_TOOL_CALLS) {
      errors.push(`Maximum tool call limit (${MAX_TOOL_CALLS}) reached, ignoring remaining.`);
      break;
    }

    const block = innermostToolBlock(match[1]);
    const parsed = tryParseJson(block) || tryParseUnstructured(block);

    if (!parsed) {
      // The fault, when we can name it, is the whole value of this message: the AI's
      // one format retry is wasted if all it's told is "that didn't parse".
      const fault = describeJsonFault(block);
      errors.push(
        `Failed to parse tool call content${fault ? ` — ${fault}` : ''}: ${block.substring(0, 100)}...`,
      );
      continue;
    }

    if (!isSupportedTool(parsed.name)) {
      errors.push(`Unknown tool: "${parsed.name}"`);
      continue;
    }

    const missing = findMissingParams(parsed.name, parsed.params);
    if (missing.length > 0) {
      errors.push(`${parsed.name}: missing required param(s) "${missing.join('", "')}"`);
      continue;
    }

    toolCalls.push(parsed);
  }

  return { toolCalls, errors };
}
