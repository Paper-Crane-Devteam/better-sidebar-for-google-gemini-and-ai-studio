/**
 * The newest model turn on the page, in the shape auto-pickup wants.
 *
 * Why this exists instead of `useConversationMessages`: AI Studio virtualises its
 * transcript. `ms-chat-turn` elements persist, but each holds a
 * `.virtual-scroll-container` whose `.turn-content` is only populated while the turn is
 * near the viewport — everything else is a spacer div with a remembered height. So the
 * shared conversation reader returns nothing useful here, and porting it would mean
 * porting a false answer.
 *
 * Pickup doesn't need history, though. It only ever asks about the newest response, and
 * that is precisely the turn auto-scroll keeps on screen.
 */

import { useEffect, useState } from 'react';
import type { PickupTurn } from '@/entrypoints/overlay.content/shared/modules/agent-loop/pickup';
import { parseAllToolCallsFromText } from '@/entrypoints/overlay.content/shared/modules/agent-loop/renderer/helpers/tool-parser';
import { AIStudioAgentAdapter } from '@/entrypoints/overlay.content/shared/modules/agent-loop/adapters/aistudio-adapter';

/**
 * How often the page is re-read.
 *
 * A clock rather than only a MutationObserver, because one of the fields is
 * `isStreaming`, which comes from the Run button — a node Angular replaces wholesale, so
 * an observer bound to it goes deaf without ever firing.
 */
const SAMPLE_MS = 500;

const adapter = new AIStudioAgentAdapter();

/**
 * Read the last turn, but only report it when it is a *model* turn.
 *
 * Stricter than the Gemini reader, which finds the last model turn wherever it is. That
 * version relies on being able to see whether a user turn follows it carrying the tool
 * results — evidence that virtualisation may have thrown away. "The conversation ends
 * with this model turn" needs no such evidence, and it is the only shape pickup is
 * actually for: the user asked something, the AI answered in tool format, nothing came
 * after.
 */
function readLastModelTurn(): PickupTurn | undefined {
  const turns = document.querySelectorAll<HTMLElement>('ms-chat-turn');
  const last = turns[turns.length - 1];
  if (!last) return undefined;

  const container = last.querySelector<HTMLElement>('[data-turn-role]');
  if (container?.dataset.turnRole !== 'Model') return undefined;

  const content = container.querySelector<HTMLElement>('.turn-content');
  if (!content) return undefined;

  const text = adapter.extractResponseText(content);
  // Empty means the turn is on the page but its content isn't rendered — scrolled far
  // enough away to be virtualised out, or still being created. Either way there is
  // nothing to parse, and reporting "no tool calls" would be a claim we can't support.
  if (!text.trim()) return undefined;

  const toolCalls = parseAllToolCallsFromText(text);

  return {
    // AI Studio gives every turn a stable `turn-<UUID>` id, which is a better latch key
    // than Gemini's positional one: it cannot be reused by a different turn.
    id: last.id || `model-${turns.length - 1}`,
    role: 'model',
    toolCalls,
    // Nothing follows the last turn, so no result can be known for these calls yet.
    toolOutcomes: toolCalls.map(() => null),
    isStreaming: adapter.getComposerState() === 'stop',
  };
}

/** Identity that changes exactly when pickup's answer could change. */
function signatureOf(turn: PickupTurn | undefined): string {
  if (!turn) return '';
  return [
    turn.id,
    turn.isStreaming ? '1' : '0',
    ...turn.toolCalls.map((tc) => tc.matchString),
  ].join('|');
}

export function useAIStudioLastModelTurn(): PickupTurn | undefined {
  const [turn, setTurn] = useState<PickupTurn | undefined>(undefined);

  useEffect(() => {
    let signature = signatureOf(undefined);

    // Same object identity while nothing meaningful moved — `useAutoPickup` drives an
    // effect off this value, and a new object twice a second would re-run every guard.
    const sample = () => {
      const next = readLastModelTurn();
      const nextSignature = signatureOf(next);
      if (nextSignature === signature) return;
      signature = nextSignature;
      setTurn(next);
    };

    sample();
    const interval = setInterval(sample, SAMPLE_MS);
    return () => clearInterval(interval);
  }, []);

  return turn;
}
