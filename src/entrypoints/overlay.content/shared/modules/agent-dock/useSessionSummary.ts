/**
 * Whether a finished session has anything to say, and what.
 *
 * ⚠️ One source of truth on purpose. This lived in two places — `AgentDock` decided
 * whether to render at all, `AgentSessionSummary` decided whether it had content — and
 * they drifted: suppressing the card for a session that ended in prose (`no_tool_call`)
 * left the dock's own rule untouched, so the dock still opened, every card inside it
 * returned null, and the result was a blank bar over the composer with no way to
 * dismiss it. It also outlived the session, because the auto-reset is skipped for a
 * finish that "needs attention".
 *
 * A container whose visibility is decided separately from its contents will always be
 * able to disagree with them. So both now ask the same question here.
 */

import { useAgentLoopStore } from '../agent-loop/agent-loop-store';
import { useUndoAvailable, useUndoWasUndone } from '../agent-loop/undo';

export interface SessionSummary {
  /** Failing steps across the whole session. Shown, and part of the decision. */
  failedSteps: number;
  undoAvailable: boolean;
  undone: boolean;
  /**
   * Whether the end of this session is worth putting on screen.
   *
   * False in two cases, both of which already speak for themselves in the transcript:
   * a clean finish with nothing to revert, and a session that ended because the model
   * answered in prose. In the second the reply *is* the outcome and the only control
   * would be a Dismiss button — a notification whose whole content is "remove me".
   */
  worthShowing: boolean;
}

export function useSessionSummary(): SessionSummary {
  const endReason = useAgentLoopStore((s) => s.endReason);
  const history = useAgentLoopStore((s) => s.history);
  const undoAvailable = useUndoAvailable();
  const undone = useUndoWasUndone();

  const failedSteps = history.reduce(
    (sum, h) => sum + h.results.filter((r) => !r.success).length,
    0,
  );

  const worthShowing = (() => {
    if (endReason === null) return false;
    // An undo still on offer, or a revert that just rewrote history, always earns the
    // card — hiding an available undo would leave the snapshot unreachable and the
    // changes unexplained.
    if (undoAvailable || undone) return true;
    // The transcript already ends with its own "Task finished" divider.
    if (endReason === 'complete') return failedSteps > 0;
    if (endReason === 'no_tool_call') return false;
    return true;
  })();

  return { failedSteps, undoAvailable, undone, worthShowing };
}
