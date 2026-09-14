/**
 * AgentDock — everything the running loop needs from the user, parked on the chat
 * composer's top-right corner.
 *
 * This used to live in the Agent tab, two clicks and a screen-width away from the
 * input box the answer had to be typed into. Worse, it was reachable only when the
 * sidebar happened to be open *and* on the Agent tab — with it closed, an approval
 * request had nowhere to appear at all and the engine sat parked forever.
 *
 * Rules it follows:
 *
 * - **Nothing on screen when nothing is running.** No session, no dock.
 * - **A single line while it works.** Not a progress report — the chat already shows
 *   what each step did, and nobody watches a step counter. The line exists for Stop.
 * - **Unfolds by itself when a decision is due**, and folds back when it's answered.
 *   The user can fold it away, but a *new* decision opens it again: silently keeping
 *   it shut would park the engine behind a collapsed chevron.
 *
 * Approval also renders on the tool call's own card in the chat, which stays the
 * primary place — the SQL is right there. Same pending object, same resolve, whoever
 * answers first wins. This is the copy that's always reachable.
 */

import React, { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { useAgentLoopStore } from '../agent-loop/agent-loop-store';
import { useAgentRecordStore } from '../agent-loop/agent-record-store';
import { useCurrentConversationId } from '../../hooks/useCurrentConversationId';
import { useComposerAnchor } from './useComposerAnchor';
import { useSessionSummary } from './useSessionSummary';
import { AgentDockPill } from './components/AgentDockPill';
import { AgentApproval } from './components/AgentApproval';
import { AgentContinuePrompt } from './components/AgentContinuePrompt';
import { AgentCheckIn } from './components/AgentCheckIn';
import { AgentInterruptNotice } from './components/AgentInterruptNotice';
import { AgentSessionSummary } from './components/AgentSessionSummary';
import { AgentPolicyControls } from './components/AgentPolicyControls';
import { AgentInstructionInput } from './components/AgentInstructionInput';
import { AgentOwedResults } from './components/AgentOwedResults';

/** Never wider than this, however wide the composer is */
const MAX_WIDTH_PX = 420;

interface AgentDockProps {
  /**
   * Hide without unmounting. The `>` entry popup anchors to the same corner of the
   * composer, and two floating panels fighting over one spot is worse than briefly
   * losing sight of the dock — which is safe to hide, because typing `>` only happens
   * while idle.
   */
  hidden?: boolean;
}

export const AgentDock: React.FC<AgentDockProps> = ({ hidden }) => {
  const status = useAgentLoopStore((s) => s.status);
  const endReason = useAgentLoopStore((s) => s.endReason);
  const pendingApproval = useAgentLoopStore((s) => s.pendingApproval);
  const checkInSteps = useAgentLoopStore((s) => s.checkInSteps);
  const awaitingUserSend = useAgentLoopStore((s) => s.awaitingUserSend);
  const sessionConversationId = useAgentLoopStore((s) => s.sessionConversationId);
  const owed = useAgentRecordStore((s) => s.owed);
  const conversationId = useCurrentConversationId();
  const { worthShowing } = useSessionSummary();

  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isRunning = status !== 'idle';
  // A session that ended without running a single tool still has something to say
  // (why it couldn't be done, or that a paywall stopped it), so `endReason` alone is
  // enough to keep the dock up.
  const hasSession = isRunning || endReason !== null;

  // A session started in a brand new chat gets its conversation id only after the
  // first send, so an unbound session belongs to whatever chat is open.
  const belongsToCurrent =
    sessionConversationId === null || sessionConversationId === conversationId;

  const isFinished = !isRunning && endReason !== null;

  /**
   * Results a previous page life ran but never sent.
   *
   * The one thing the dock shows with **no session at all**, so it gets its own limb in
   * the visibility rule rather than being folded into `hasSession`. Scoped to the open
   * conversation for the same reason a session is: the offer is to send a payload into
   * *this* chat.
   */
  const hasOwedResults =
    owed !== null && owed.conversationId === conversationId && !isRunning;

  /**
   * ⚠️ A finished session is gated on `worthShowing` — the same value
   * `AgentSessionSummary` uses to decide whether it renders anything. The dock used to
   * decide this for itself, and when the card learned to stay quiet after a
   * `no_tool_call` finish this rule did not follow: the container opened around a body
   * where every card returned null, leaving a blank bar over the composer that nothing
   * could dismiss and the auto-reset skipped.
   */
  const visible =
    !hidden &&
    ((hasSession && belongsToCurrent && (!isFinished || worthShowing)) || hasOwedResults);
  const anchor = useComposerAnchor(visible);

  // Adopt the conversation id once the platform assigns one — including after the
  // session has finished, or an unbound session would follow the user everywhere.
  useEffect(() => {
    if (hasSession && sessionConversationId === null && conversationId) {
      useAgentLoopStore.getState().attachSessionConversation(conversationId);
    }
  }, [hasSession, sessionConversationId, conversationId]);

  // Drop a finished session when the user navigates away from its conversation
  useEffect(() => {
    if (!isRunning && endReason !== null && !belongsToCurrent) {
      useAgentLoopStore.getState().reset();
    }
  }, [isRunning, endReason, belongsToCurrent]);

  /**
   * Clear the session state behind a finish nobody has to act on.
   *
   * Nothing is on screen for this case (see `worthShowing`), so the delay isn't about
   * giving the user time to read — it's slack for the undo state and the rest to settle
   * before what they're read from is thrown away.
   *
   * Deliberately not applied to the cases that *do* show a card: an earlier version
   * auto-reset every ended session, which discarded the paywall's upgrade button and
   * any run with failed steps out from under the user.
   */
  useEffect(() => {
    if (isRunning || endReason === null || !belongsToCurrent) return;
    if (worthShowing) return;

    const timer = setTimeout(() => useAgentLoopStore.getState().reset(), 4000);
    return () => clearTimeout(timer);
  }, [isRunning, endReason, belongsToCurrent, worthShowing]);

  /**
   * Identifies *which* decision is currently pending, so a new one can re-open a dock
   * the user folded away. Comparing a boolean wouldn't do it: approve one write, get
   * asked about the next, and the dock would stay shut on a live question.
   */
  const decisionKey = pendingApproval
    ? `approval:${pendingApproval.fingerprint}`
    : // Only an `awaiting_send` the engine won't handle itself, or the dock would
      // unfold and refold once per round through an unattended run.
      status === 'awaiting_send' && awaitingUserSend
      ? 'send'
      : checkInSteps !== null
        ? `checkin:${checkInSteps}`
        : status === 'paused' || status === 'error'
          ? `interrupt:${status}`
          : endReason !== null && !isRunning
            ? `end:${endReason}`
            : null;

  useEffect(() => {
    if (decisionKey) setCollapsed(false);
  }, [decisionKey]);

  // The dock returns null between sessions but stays mounted, so its own state has to
  // be cleared — otherwise the next task opens with the previous one's drawer showing.
  useEffect(() => {
    if (!hasSession) {
      setCollapsed(false);
      setSettingsOpen(false);
    }
  }, [hasSession]);

  if (!visible || !anchor) return null;

  const expanded = decisionKey !== null ? !collapsed : settingsOpen;

  /**
   * With a decision on screen the chevron folds it away; without one there is nothing
   * to fold, so it opens the only other thing the dock holds — the switches. Wiring it
   * to `collapsed` in both cases made it a dead control for the whole run: nothing
   * pending means nothing appears, however many times you click it.
   */
  const toggleExpanded = () => {
    if (decisionKey !== null) setCollapsed((c) => !c);
    else setSettingsOpen((s) => !s);
  };

  return (
    <div
      className="fixed z-[9998] overflow-hidden rounded-lg bg-popover shadow-[shadow:var(--shadow-popover)]"
      style={{
        bottom: `${anchor.bottom}px`,
        right: `${anchor.right}px`,
        width: `${Math.min(anchor.width, MAX_WIDTH_PX)}px`,
      }}
    >
      {/* Hide the status pill once the task is done — it only adds noise next to the
          summary card. Still shown while the session is running or paused. */}
      {hasSession && !isFinished && (
        <AgentDockPill
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          settingsOpen={settingsOpen}
          onToggleSettings={() => {
            setSettingsOpen((s) => !s);
            setCollapsed(false);
          }}
        />
      )}

      {/* `pt-3` only when the pill is gone: with it there, the pill's own bottom
          padding already separates the two, and adding more doubles the gap. */}
      {/* No pill above when there is no session, so the body carries the top padding
          in that case too. */}
      {(expanded || isFinished || !hasSession) && (
        <div
          className={cn(
            'max-h-[50vh] space-y-2 overflow-y-auto px-3 pb-3',
            (isFinished || !hasSession) && 'pt-3',
          )}
        >
          {/* First: it is about work that already happened, and it is the only card
              here that can be the sole reason the dock is on screen. */}
          <AgentOwedResults />
          <AgentApproval />
          <AgentContinuePrompt />
          <AgentCheckIn />
          <AgentInterruptNotice />
          <AgentSessionSummary />

          {settingsOpen && <AgentPolicyControls />}

          {/* Rides along with the next batch of tool results, so it only makes sense
              while a round is still coming. */}
          {isRunning && <AgentInstructionInput />}
        </div>
      )}
    </div>
  );
};
