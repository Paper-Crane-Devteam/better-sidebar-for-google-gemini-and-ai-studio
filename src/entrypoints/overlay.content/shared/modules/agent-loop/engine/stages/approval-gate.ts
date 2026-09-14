/**
 * Holding a tool call until the user says go.
 *
 * This used to live inside `execute-sql`, which had two consequences. A tool
 * reached into the UI to open a dialog, and the request carried only the SQL — no
 * way to say *which* call it belonged to. So approval could only ever be a separate
 * dialog describing the call second-hand, while the "Run" button sitting on the
 * call's own card in the chat was a completely independent path that appended its
 * result to the composer for the user to send by hand.
 *
 * Two ways to approve the same operation meant a ledger of executed fingerprints, a
 * disabled state while the engine was busy, and a check-then-act race between them.
 * All of that existed to keep the two paths from colliding.
 *
 * Now there is one path: the engine always executes, and the card button is how you
 * approve. Same promise, answered from wherever the user happens to be looking.
 */

import type { ApprovalDecision, ParsedToolCall } from '../../types';
import type { LoopContext } from '../context';
import { getToolRisk } from '../../execution-policy';
import { AbortError } from '../guards/abort';
import { isBrowserWrite, type PlanPreview } from '@/shared/browser-agent/contracts';

/** Approved with no user present — used when the policy says this call is free */
export const AUTO_APPROVED: ApprovalDecision = { approved: true, scope: 'once' };

export interface ApprovalRequest {
  browserPlan?: PlanPreview;
  toolCall: ParsedToolCall;
  fingerprint: string;
  /** How many calls are still queued after this one, for the "rest of this response" option */
  remaining: number;
}

/**
 * Park until the user decides. Rejects with `AbortError` when the run is cancelled,
 * which unwinds through the engine's normal abort handling.
 */
export function requestApproval(
  ctx: LoopContext,
  { toolCall, fingerprint, remaining, browserPlan }: ApprovalRequest,
): Promise<ApprovalDecision> {
  return new Promise<ApprovalDecision>((resolve, reject) => {
    const signal = ctx.abort.signal;
    let settled = false;

    ctx.setStatus('awaiting_approval');
    ctx.events.emit('user:approval-requested', {
      toolName: toolCall.name,
      risk: getToolRisk(toolCall),
    });
    console.log('[AgentLoop] Waiting for approval:', toolCall.name);

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      if (ctx.store.pendingApproval?.resolve === onDecision) ctx.store.setPendingApproval(null);
    };

    function onDecision(decision: ApprovalDecision) {
      if (settled) return;
      settled = true;
      cleanup();

      // Widen the approval before returning, so the calls behind this one don't ask
      if (!isBrowserWrite(toolCall.name) && decision.approved && decision.scope === 'round') {
        ctx.store.setApproveRestOfRound(true);
      }
      if (!isBrowserWrite(toolCall.name) && decision.approved && decision.scope === 'task') {
        ctx.store.setSpeedMode(true);
      }

      ctx.events.emit('user:approval-answered', {
        toolName: toolCall.name,
        approved: decision.approved,
        scope: decision.scope,
      });
      ctx.setStatus('executing');
      resolve(decision);
    }

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new AbortError());
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);

    // Published last: the UI can answer synchronously, and cleanup has to be able
    // to recognise this handler by then.
    ctx.store.setPendingApproval({
      browserPlan,
      fingerprint,
      toolName: toolCall.name,
      description: toolCall.description,
      params: toolCall.params,
      risk: getToolRisk(toolCall),
      remaining,
      resolve: onDecision,
    });
  });
}
