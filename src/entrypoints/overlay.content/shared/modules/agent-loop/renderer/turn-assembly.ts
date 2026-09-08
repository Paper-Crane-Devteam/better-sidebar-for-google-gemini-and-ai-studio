/**
 * Turning conversation text into the turns the agent view renders.
 *
 * Split out of `useConversationMessages` when AI Studio arrived, because that hook did
 * two unrelated jobs: *reading* the conversation (walking Gemini's DOM) and *parsing* it
 * (markers, tool calls, results, outcome pairing). Only the first is platform-specific.
 * The second is string work, and it is the part with all the wire-format knowledge in it
 * — a second copy would be a second thing to keep in step with `formatter.ts`.
 */

import { extractPromptId, RESULT_TAG } from './constants';
import { parseAllToolCallsFromText } from './helpers/tool-parser';
import { deriveToolOutcomes, parseToolResults, type ToolResultEntry } from './helpers/tool-outcomes';
import { getAgentEntryById } from '../agent-entry';
import type { DisplayMessageTurn } from './useConversationMessages';

/** One conversation turn as read off whichever source the platform uses */
export interface RawTurn {
  /** Stable within a conversation — becomes the React key and the pickup latch key */
  id: string;
  role: 'user' | 'model';
  /** Markdown-ish text: the model's own output, not rendered HTML */
  text: string;
  /** Only ever true for the newest model turn */
  isStreaming: boolean;
}

/**
 * Zero-width spaces and BOMs, stripped on the way in.
 *
 * These are our own doing: staging a multi-line payload into Quill needs a placeholder in
 * otherwise-empty `<p>`s (see `replaceAllContent`), and it survives the round trip through
 * the platform into the text we read back here.
 *
 * `String#trim` does not treat U+200B as whitespace, so a result section that began with
 * one stopped matching `/^###/` — every result after the first rendered as a blank row
 * with a tall empty line above its body, and `readOutcome` failed to strip the header, so
 * `ERROR:` bodies were read as successes.
 *
 * Fixed here rather than at the writer, which still needs the placeholder, and which
 * couldn't help the messages already sitting in people's conversations. U+200C/D are
 * deliberately left alone: they carry meaning in emoji sequences and in Arabic and
 * Persian text.
 */
const ZERO_WIDTH_RE = /[\u200B\uFEFF]/g;

/**
 * Detect and extract prompt marker `[#bs-agent:<id>#]` from text.
 *
 * If found, returns the prompt metadata and the user's own text (after "## User Request").
 * If the message is purely system/prompt content, `cleanText` is empty — which is the
 * point: the assembled prompt is tens of thousands of characters of instructions the user
 * never typed and must not be shown to them.
 */
function parsePromptMarker(text: string): {
  promptId: string | null;
  promptTitle: string | null;
  promptContent: string | null;
  cleanText: string;
} {
  const promptId = extractPromptId(text);
  if (!promptId) {
    return { promptId: null, promptTitle: null, promptContent: null, cleanText: text };
  }

  // Resolve against the current agent entries (auto entry + skills). The old built-in
  // prompt registry doesn't know skill ids, so titles fell back to raw ids.
  const entry = getAgentEntryById(promptId);
  const promptTitle = entry?.title || promptId;
  const promptContent = entry?.skill?.promptContent || '';

  let cleanText = '';
  if (text.includes('## User Request')) {
    const parts = text.split(/## User Request\s*/i);
    cleanText = parts[1]?.trim() || '';
  }

  return { promptId, promptTitle, promptContent, cleanText };
}

/** Parse a user message: tool results, prompt marker, and what's left to display */
function parseUserMessage(text: string) {
  let displayText = text;
  let promptId: string | undefined;
  let promptTitle: string | undefined;
  let promptContent: string | undefined;
  let toolResults: ToolResultEntry[] = [];

  // 1. Tool result tags
  if (text.includes(`<${RESULT_TAG}>`)) {
    const parsed = parseToolResults(text);
    toolResults = parsed.results;
    displayText = parsed.cleanText;
  }

  // 2. Prompt marker in whatever remains
  const markerParsed = parsePromptMarker(displayText);
  if (markerParsed.promptId) {
    promptId = markerParsed.promptId;
    promptTitle = markerParsed.promptTitle || undefined;
    promptContent = markerParsed.promptContent || undefined;
    displayText = markerParsed.cleanText;
  }

  return { displayText, promptId, promptTitle, promptContent, toolResults };
}

/**
 * Assemble raw turns into what the view renders.
 *
 * ⚠️ Tool calls are only parsed out of **model** turns. The first user message carries the
 * whole assembled prompt, and that prompt documents the tool schemas — complete with
 * `<bs_agent_tool>` examples. Parsing user turns would turn the instructions into a row of
 * phantom tool cards on the very first message.
 */
export function assembleTurns(raw: RawTurn[]): DisplayMessageTurn[] {
  const turns: DisplayMessageTurn[] = [];

  for (const item of raw) {
    const text = item.text.replace(ZERO_WIDTH_RE, '');

    if (item.role === 'user') {
      const { displayText, promptId, promptTitle, promptContent, toolResults } =
        parseUserMessage(text);

      turns.push({
        id: item.id,
        role: 'user',
        rawText: text,
        displayText,
        promptId,
        promptTitle,
        promptContent,
        toolResults,
        toolCalls: [],
        toolOutcomes: [],
        isStreaming: false,
      });

      // Results arrive one turn after the calls they belong to, so the model turn just
      // behind this one is the owner. Resolved here rather than in the component, which
      // only ever sees a single turn.
      const previous = turns[turns.length - 2];
      if (previous?.role === 'model' && previous.toolCalls.length > 0) {
        previous.toolOutcomes = deriveToolOutcomes(previous.toolCalls, toolResults);
      }
    } else {
      // A block still being written is only meaningful while the turn is arriving.
      // On a settled turn an unclosed block is a truncation, and a placeholder that
      // never resolves would be worse than none — see `findPendingToolCall`.
      const toolCalls = parseAllToolCallsFromText(text, {
        includePending: item.isStreaming,
      });

      turns.push({
        id: item.id,
        role: 'model',
        rawText: text,
        displayText: text,
        toolResults: [],
        toolCalls,
        toolOutcomes: toolCalls.map(() => null),
        isStreaming: item.isStreaming,
      });
    }
  }

  return turns;
}
