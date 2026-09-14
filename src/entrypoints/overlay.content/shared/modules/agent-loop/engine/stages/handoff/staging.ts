/**
 * Putting the results into the chat input.
 *
 * Two shapes, and the difference matters downstream:
 * - **capsule** (preferred) — one collapsed chip per tool result, with the payload
 *   in a data attribute. The platform's send interceptor merges them into a single
 *   `<bs_agent_result>` block on the way out.
 * - **text** (fallback) — the wrapped payload dumped in as plain text.
 *
 * Which one you get is the *adapter's* answer, not a decision made here: capsules need
 * an editor that can hold non-text nodes, so Gemini's Quill composer offers them and
 * AI Studio's plain `<textarea>` does not. On AI Studio `text` is therefore the normal
 * path rather than a degradation, and the payload is visible in the input box.
 *
 * The fallback is also a real fallback on Gemini: a failed capsule write left the
 * composer *empty*, and Gemini renders no send button when the input is empty. That
 * surfaced as a baffling "could not find send button", so staging verifies its own
 * work and degrades to something ugly but sendable.
 */

import type { AgentPlatformAdapter } from '../../../adapters/types';
import { RESULT_OPEN_TAG, splitSections, wrapForAI } from './formatter';

/** How the payload currently sits in the editor */
export type StagedShape = 'capsule' | 'text';

/**
 * Stage `resultText` in the composer and report which shape it ended up in, so the
 * send watcher knows what to look for.
 */
export async function stageResults(
  adapter: AgentPlatformAdapter,
  resultText: string,
): Promise<StagedShape> {
  const editor = adapter.getEditor();
  if (!editor) {
    console.warn('[AgentLoop] Editor not found, inserting raw text');
    adapter.insertText(wrapForAI(resultText));
    return 'text';
  }

  if (adapter.stageResultCapsules) {
    const sections = splitSections(resultText);
    const staged = await adapter.stageResultCapsules(
      sections.length > 0
        ? // Per-tool capsules; the interceptor wraps the merged content on send
          sections
        : // No recognisable structure — one capsule carrying the whole payload
          [{ label: 'Tool Results', content: wrapForAI(resultText) }],
    );
    if (staged) return 'capsule';

    console.warn('[AgentLoop] Capsule staging failed, falling back to plain text', {
      editorTextLength: (editor.textContent || '').length,
      sectionsRequested: sections.length,
    });
  }

  adapter.insertText(wrapForAI(resultText));
  return 'text';
}

/**
 * Whether the composer still holds unsent results.
 *
 * Shape-aware on purpose: checking for capsules while the fallback is active would
 * report "already sent" on the very first DOM mutation.
 */
export function isStaged(adapter: AgentPlatformAdapter, shape: StagedShape): boolean {
  if (shape === 'capsule') return adapter.hasStagedCapsules?.() ?? false;
  return adapter.getText().includes(RESULT_OPEN_TAG);
}
