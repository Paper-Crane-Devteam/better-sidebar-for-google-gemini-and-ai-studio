/**
 * Put an example sentence in the page's chat input, behind the agent's capsule, unsent.
 *
 * The one thing every agent panel does with an example, and the one place it can go wrong in
 * four different ways. Both panels used to own a copy; the Browser panel's arrival is what
 * made that a duplication rather than a coincidence, since the failure modes are identical
 * and none of them are about which agent it is.
 *
 * ## Why it is a round trip and not a function call
 *
 * The agent runs through the *page's* composer, not the sidebar, and the sidebar cannot see
 * it — a platform feature component owns the editor and listens for `launcher:run-entry`. So
 * staging is a request that may go unanswered, and "unanswered" is a real state with a real
 * cause: no chat open, or the feature disabled. Hence the timeout: nothing acknowledged
 * within {@link ACK_MS}, so say the chat input is unreachable rather than appearing to do
 * nothing.
 *
 * ⚠️ Staging while a task is live would overwrite what that task has queued in the composer,
 * so `busy` is checked before the request is even sent — the panel goes inert instead of
 * looking clickable.
 */

import { useState } from 'react';
import { getAgentEntryById } from '../../agent-loop/agent-entry';
import { agentEventBus } from '../../agent-loop/event-bus';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { getActiveEngine } from '../../agent-loop/engine/engine-registry';

/** How long to wait for the platform feature to acknowledge the request. */
const ACK_MS = 1200;

/** Why the last attempt did not reach the chat input. `null` = it did, or none was made. */
export type StageProblem = 'no-editor' | 'composer-busy' | 'session-busy' | null;

export interface StageExample {
  /** The agent entry, so the caller can quote its title on the capsule. */
  entryTitle: string;
  stage: (text: string) => void;
  problem: StageProblem;
  clearProblem: () => void;
  /** A session is running: nothing here is clickable. */
  busy: boolean;
  /** Stop that session, so the panel becomes usable again. */
  stopRunning: () => void;
}

export function useStageExample(agentId: string, fallbackTitle: string): StageExample {
  const [problem, setProblem] = useState<StageProblem>(null);
  const status = useAgentLoopStore((s) => s.status);
  const busy = status !== 'idle';

  const entry = getAgentEntryById(agentId);

  const stage = (text: string) => {
    setProblem(null);
    if (busy || !entry) {
      setProblem('session-busy');
      return;
    }

    let settled = false;
    const offStaged = agentEventBus.once('launcher:staged', () => {
      settled = true;
    });
    const offFailed = agentEventBus.once('launcher:failed', ({ reason }) => {
      settled = true;
      setProblem(reason === 'composer-busy' || reason === 'session-busy' ? reason : 'no-editor');
    });

    agentEventBus.emit('launcher:run-entry', {
      entryId: entry.id,
      userInput: text,
      autoSend: false,
    });

    setTimeout(() => {
      offStaged();
      offFailed();
      if (!settled) setProblem('no-editor');
    }, ACK_MS);
  };

  const stopRunning = () => {
    const engine = getActiveEngine();
    if (engine) engine.stop();
    else useAgentLoopStore.getState().stop();
    setProblem(null);
  };

  return {
    entryTitle: entry?.title ?? fallbackTitle,
    stage,
    problem,
    clearProblem: () => setProblem(null),
    busy,
    stopRunning,
  };
}
