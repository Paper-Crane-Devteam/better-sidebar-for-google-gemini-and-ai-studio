/**
 * AgentQuickPrompts — a row of short starters above the composer, right after an agent is
 * picked from `>`.
 *
 * Picking an agent leaves the user with a capsule and an empty line after it, which is the
 * exact moment "what can this thing do" is the question. So a few buttons appear at the
 * cursor, each dropping a short sentence in after the capsule for the user to finish.
 *
 * ## When it shows
 *
 * One rule: **the agent marker is followed by exactly one space, and nothing else.** That is
 * precisely the state picking from the popup leaves behind, so:
 *
 * - pick an agent → it appears;
 * - type anything (a space included), or click a starter → it goes;
 * - delete back down to the marker and its space → it comes back.
 *
 * No dismiss button and no remembered state: the composer's text is the whole answer, and
 * the platform feature that owns the editor is the one that reads it (`readStagedAgent`).
 * On top of that it stays out of the way of anything else that anchors to the composer —
 * a running session, the dock's cards, the `>` and `/` popups.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAgentLoopStore } from '../agent-loop/agent-loop-store';
import { useAgentRecordStore } from '../agent-loop/agent-record-store';
import type { AgentId } from '../agent-loop/agents/types';
import { useCurrentConversationId } from '../../hooks/useCurrentConversationId';
import { useComposerAnchor } from './useComposerAnchor';
import { getQuickPrompts } from './quick-prompts';

/**
 * Fallback clock for re-reading the composer.
 *
 * `input` events cover typing and our own writes, but not everything: Gemini's editor node
 * is replaced on navigation, and AI Studio can reset its textarea without firing one.
 */
const SAMPLE_MS = 250;

interface AgentQuickPromptsProps {
  /**
   * The staged agent, but only while the composer is "marker + one space" — see the file
   * header. Null otherwise.
   */
  readStagedAgent: () => AgentId | null;
  /** Put `text` in the composer after the agent capsule, replacing what follows it. */
  onPick: (text: string) => void;
  /** Hide without unmounting — e.g. while the `>` or `/` popup is up. */
  hidden?: boolean;
}

export const AgentQuickPrompts: React.FC<AgentQuickPromptsProps> = ({
  readStagedAgent,
  onPick,
  hidden,
}) => {
  const { t } = useI18n();
  const status = useAgentLoopStore((s) => s.status);
  const endReason = useAgentLoopStore((s) => s.endReason);
  const owed = useAgentRecordStore((s) => s.owed);
  const conversationId = useCurrentConversationId();

  const [agentId, setAgentId] = useState<AgentId | null>(null);

  // Latest reader without restarting the listeners every render
  const readRef = useRef(readStagedAgent);
  readRef.current = readStagedAgent;

  useEffect(() => {
    const sample = () => {
      const next = readRef.current();
      setAgentId((prev) => (prev === next ? prev : next));
    };
    sample();
    // Immediate on every keystroke, so the row vanishes with the first character typed
    // rather than a clock tick later. Capture phase: the page may stop propagation.
    document.addEventListener('input', sample, true);
    const interval = setInterval(sample, SAMPLE_MS);
    return () => {
      document.removeEventListener('input', sample, true);
      clearInterval(interval);
    };
  }, []);

  // Same conditions under which the dock would take this spot while idle.
  const dockHasCard =
    endReason !== null || (owed !== null && owed.conversationId === conversationId);

  const prompts = agentId ? getQuickPrompts(agentId) : [];
  const visible = !hidden && status === 'idle' && !dockHasCard && prompts.length > 0;
  const anchor = useComposerAnchor(visible);

  if (!visible || !anchor || !agentId) return null;

  const prefix = `agent.quickPrompts.${agentId}`;

  return (
    <div
      role="toolbar"
      aria-label={t('agent.quickPrompts.label', { defaultValue: 'Quick starts' })}
      // No surface of its own — each button is its own chip — so the gaps between them
      // must not swallow clicks meant for the page underneath.
      className="pointer-events-none fixed z-[9998] flex flex-wrap items-end gap-1.5"
      style={{
        bottom: `${anchor.bottom}px`,
        right: `${anchor.right}px`,
        width: `${anchor.width}px`,
      }}
      // Keep focus in the composer: a blur there can collapse Gemini's input, and the
      // click handler writes into it anyway.
      onMouseDown={(e) => e.preventDefault()}
    >
      {prompts.map((prompt) => (
        <button
          key={prompt.key}
          type="button"
          onClick={() =>
            onPick(t(`${prefix}.${prompt.key}.text`, { defaultValue: prompt.text }))
          }
          className="pointer-events-auto whitespace-nowrap rounded-full border border-border bg-popover px-3 py-1.5 text-sm text-foreground/80 shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          {t(`${prefix}.${prompt.key}.label`, { defaultValue: prompt.label })}
        </button>
      ))}
    </div>
  );
};
