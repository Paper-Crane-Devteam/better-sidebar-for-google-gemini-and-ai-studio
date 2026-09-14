/**
 * Agent Loop Renderer — Constants & Markers.
 *
 * Defines the unique markers used to identify our prompt messages
 * and tool calls in the Gemini conversation DOM.
 */

/**
 * Marker prefix inserted at the beginning of agent loop messages (user-query).
 * This is the first line of text the user sends when they select a built-in prompt.
 * Format: [#bs-agent:<prompt-id>#]
 *
 * Example: [#bs-agent:auto-classify#]
 */
export const PROMPT_MARKER_PREFIX = '[#bs-agent:';
export const PROMPT_MARKER_SUFFIX = '#]';

/** Build a full prompt marker line for a given prompt ID */
export function buildPromptMarker(promptId: string): string {
  return `${PROMPT_MARKER_PREFIX}${promptId}${PROMPT_MARKER_SUFFIX}`;
}

/** Extract prompt ID from text, or null if not a valid marker */
export function extractPromptId(text: string): string | null {
  const match = text.match(/\[#bs-agent:([a-zA-Z0-9_-]+)#\]/);
  return match ? match[1] : null;
}

/**
 * The tool call tag name used in AI responses.
 * Re-exported from the parser so the two can't drift apart.
 */
export { TOOL_TAG as TOOL_CALL_TAG } from '../engine/parser/tool-schema';

/**
 * The result tag name used in user messages when sending tool results back.
 * Wraps the tool execution output sent to the AI.
 */
export const RESULT_TAG = 'bs_agent_result';

/**
 * Tool calls that get no card in the conversation view.
 *
 * `complete_task` is protocol plumbing, not work: it carries no result worth
 * reading, takes no approval, and its summary already headlines the session card
 * in the Agent tab. Shown in the chat it reads as one more step the agent took,
 * right at the moment the user is looking for the outcome.
 *
 * Hidden means the card is skipped, *not* that the block is dropped from parsing —
 * the raw `<bs_agent_tool>` text still has to be swallowed, or it surfaces as JSON
 * in the markdown around it.
 *
 * Deliberately its own list rather than an alias for `CONTROL_TOOLS`: that one
 * answers "does this need approval", this one answers "is this worth showing", and
 * a tool can plausibly be one without the other.
 */
export const HIDDEN_TOOLS: readonly string[] = ['complete_task'];

/** Whether this tool call should be rendered in the conversation view */
export function isHiddenTool(toolName: string): boolean {
  return HIDDEN_TOOLS.includes(toolName);
}

/**
 * CSS class applied to user-query elements that contain agent prompts.
 * Used by the renderer to mark elements as already processed.
 */
export const PROMPT_RENDERED_CLASS = 'bs-agent-prompt-rendered';

/**
 * CSS class applied to model-response elements that contain tool calls.
 * Used by the renderer to mark elements as already processed.
 */
export const TOOL_CALL_RENDERED_CLASS = 'bs-agent-tool-rendered';

/**
 * Data attribute for storing prompt ID on rendered elements.
 */
export const PROMPT_ID_ATTR = 'data-bs-agent-prompt-id';

/**
 * Data attribute for storing tool call info on rendered elements.
 */
export const TOOL_CALL_ATTR = 'data-bs-agent-tool';

/**
 * Candidate selectors for the conversation scroll container, in priority order.
 *
 * ⚠️ Order matters and a comma-separated selector list will NOT work here:
 * `querySelector('a, b')` returns the first match in *document order*, not in
 * the order the selectors are listed. On Gemini the infinite-scroller has no
 * `.chat-history` class, so a combined list silently resolved to the first
 * `.conversation-container` — a single turn, nested inside the very element the
 * overlay hides. Iterate explicitly instead.
 */
const SCROLLER_SELECTORS = [
  'chat-window infinite-scroller', // Gemini
  'infinite-scroller.chat-history', // Gemini (older markup)
  '#chat-history', // Gemini fallback
  'ms-autoscroll-container', // AI Studio
  '.conversation-container', // last resort — a single turn
] as const;

/**
 * Where the agent view's portal host is attached, which is **not** always the scroller.
 *
 * The host is `position: absolute; inset: 0`, so it anchors to its offset parent's padding
 * box. Attach it to a scrolling element and it is content-anchored: it sits at scroll
 * offset 0 and slides out of sight along with the turns it replaces. Gemini's answer to
 * that is to pin the native scroller at the top for as long as the overlay is up.
 *
 * ⚠️ That answer is actively harmful on AI Studio, and this function exists because of it.
 * Its transcript is virtualised, so pinning the scroller at the top **unmounts the newest
 * turn's content** — and the newest turn is exactly what `useAIStudioLastModelTurn` reads
 * for auto-pickup, and what the engine hands to `startFromExistingResponse`. Covering the
 * conversation would have quietly disabled follow-up pickup in every conversation the
 * overlay was active in.
 *
 * Both AI Studio candidates below are non-scrolling, so the overlay is viewport-stable,
 * nothing needs pinning, and the native scroller keeps its position.
 *
 * `.chat-view-container` is preferred because it is the **whole** chat column, and the
 * things we have to cover live outside its inner box:
 *
 *   .chat-view-container   x 349–1212, y  56–744   ← padding 12px 20px 0
 *     ms-chat-session      x 369–1192, y  68–744   ← inset by exactly that padding
 *       ms-items-scrollbar x 1180–1212             ← absolute, right: -20px
 *
 * AI Studio's own turn-marker rail deliberately overhangs `ms-chat-session` by 20px, so an
 * overlay bounded by `ms-chat-session` leaves it poking out on the right and reads as a
 * stray native scrollbar. Anchoring one level up covers the rail and the 12px above the
 * transcript in one go, with a plain `inset: 0` and no negative offsets to keep in sync.
 *
 * Safe despite `overflow-y: auto`: it does not actually scroll (`scrollHeight ===
 * clientHeight` — the real scroller is `ms-autoscroll-container` inside it), and every
 * absolutely positioned descendant already resolves against a positioned ancestor within
 * it, so the `position: relative` the host setup applies changes nothing for AI Studio.
 *
 * `ms-chat-session` stays as the fallback: if this class is ever renamed we lose the extra
 * 20px of coverage rather than the overlay itself.
 */
const OVERLAY_HOST_SELECTORS = [
  '.chat-view-container', // AI Studio — the full chat column
  'ms-chat-session', // AI Studio — the scroller's non-scrolling twin
] as const;

/**
 * Horizontal padding the agent view needs so its turns line up with the native ones.
 *
 * The host covers the chat column's *border* box while AI Studio lays its turns out inside
 * the column's 20px padding. Without adding that back the transcript would jump 20px wider
 * on each side the moment the overlay took over — see `OVERLAY_HOST_SELECTORS` for why the
 * host is anchored to the outer box in the first place.
 *
 * 16px is the `p-4` the panel uses everywhere else; the 20px on top of it is AI Studio's.
 */
export const AI_STUDIO_OVERLAY_PADDING_X = 36;

/**
 * Find the element to attach the overlay's portal host to.
 *
 * Falls back to the scroller, which is what Gemini uses and what the pinning logic in
 * `ConversationOverlay` is written for.
 */
export function findOverlayHost(): HTMLElement | null {
  for (const selector of OVERLAY_HOST_SELECTORS) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const found = candidates.find(isRendered) ?? candidates[0];
    if (found) return found;
  }
  return findConversationScroller();
}

/** On screen, as opposed to a detached/hidden leftover of a previous conversation. */
function isRendered(el: HTMLElement): boolean {
  return el.isConnected && el.offsetHeight > 0 && el.offsetWidth > 0;
}

/**
 * Find the conversation scroll container for the current platform.
 *
 * Within one selector we take the first *rendered* match, not simply the first:
 * Gemini can leave the previous conversation's scroller in the document during
 * SPA navigation, and document order puts it ahead of the live one. Picking it
 * left the overlay and the view toggle reading a chat the user had already left.
 */
export function findConversationScroller(): HTMLElement | null {
  for (const selector of SCROLLER_SELECTORS) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (candidates.length === 0) continue;
    return candidates.find(isRendered) ?? candidates[0];
  }
  return null;
}
