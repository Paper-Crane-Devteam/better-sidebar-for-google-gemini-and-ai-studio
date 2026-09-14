/**
 * Stage ③ — run the round's tool calls.
 *
 * Per call, in order: ask the circuit breaker whether this is a loop, gate it behind
 * an approval if policy says so, execute, record the outcome (store + fingerprint
 * ledger + events), then check for the two signals that end the session outright —
 * `complete_task` and a paywall hit.
 *
 * Every branch still produces a markdown section, because whatever happened has to
 * be reported back to the AI. A silent abort would leave it guessing — a refusal in
 * particular has to say so, or the AI's next move is the same statement again.
 */

import type { ParsedToolCall } from '../../types';
import type { LoopContext } from '../context';
import { executeToolCall } from '../../tools/tool-registry';
import { parseCompleteTaskSignal } from '../../tools/complete-task';
import { PAYWALL_SIGNAL } from '../../tools/paywall-signal';
import {
  buildToolCallFingerprint,
  buildToolCallKey,
  getToolRisk,
  requiresApproval,
} from '../../execution-policy';
import { deliversResultToAI, isHandoffTool } from '../parser/tool-schema';
import { formatSectionHeading } from './handoff/formatter';
import { AUTO_APPROVED, requestApproval } from './approval-gate';
import { toolCallRecorder } from '../../records';
import { isBrowserTool, isBrowserWrite, type PlanPreview } from '@/shared/browser-agent/contracts';
import { browserRequest, prepareBrowserCall, safeBrowserText } from '../../../browser-agent/client';

export type ExecuteOutcome =
  /** Round finished; feed these sections back to the AI */
  | { kind: 'results'; results: string[] }
  /**
   * A guard stopped the round, but the AI is still owed a report of what happened.
   *
   * Distinct from `ended` because these results must reach the AI eventually — the
   * caller stages them without sending, so "Retry" delivers the errors and the AI
   * gets a chance to correct itself. Dropping them was a dead end: the loop paused
   * with nothing in the composer, so Retry went back to waiting for a reply to a
   * message that was never sent, and sat there until the idle timeout.
   */
  | { kind: 'halted'; results: string[]; reason: string }
  /** Session is genuinely over (complete_task / paywall) — nothing owed, already reported */
  | { kind: 'ended' };

/** A tool result that starts with either prefix counts as a failure */
function isSuccess(result: string): boolean {
  return !result.startsWith('ERROR:') && !result.startsWith('CANCELLED:');
}

/**
 * One tool's outcome as the AI will read it.
 *
 * The heading carries `key` — the digest of this very call — so that reading the
 * conversation back later is a lookup rather than a guess. See `formatter.ts`.
 */
function section(toolCall: ParsedToolCall, key: string, body: string): string {
  return `${formatSectionHeading(toolCall.description || toolCall.name, key)}\n${body}`;
}

export async function executeTools(
  ctx: LoopContext,
  toolCalls: ParsedToolCall[],
): Promise<ExecuteOutcome> {
  ctx.setStatus('executing');
  // The failure budget is counted per round: several statements failing on the same
  // wrong assumption is one mistake, not five.
  ctx.breaker.beginRound();
  const results: string[] = [];

  /**
   * Calls in this round that failed or were refused, by label.
   *
   * Collected for one purpose: to refuse a `complete_task` that arrives in the same
   * response. See the completion branch below.
   */
  const trouble: string[] = [];

  for (const [index, toolCall] of toolCalls.entries()) {
    ctx.abort.check();

    // Computed before any branch: every section written below carries the key, the
    // breaker's hard stop included.
    const fingerprint = buildToolCallFingerprint(toolCall);
    const key = buildToolCallKey(toolCall);

    // ── Guard: is the AI repeating itself? ─────────────────────────────────
    const loopCheck = ctx.breaker.checkRepeatedToolCall(toolCall.name, toolCall.params);

    if (loopCheck.action === 'stop') {
      console.warn('[AgentLoop] Circuit breaker: loop hard stop');
      results.push(section(toolCall, key, loopCheck.message));
      return halt(
        ctx,
        results,
        'The agent kept issuing the same call. Review it above, then retry to tell it so.',
      );
    }

    if (loopCheck.action === 'warn') {
      // Warn but still run it once more — the AI gets a chance to self-correct.
      // No key: this section answers no call, which is exactly the case that used to
      // knock the old positional matching one out of step.
      results.push(`### ⚠️ Loop Warning\n${loopCheck.message}`);
    }

    // ── Gate: does the user have to say go? ────────────────────────────────
    let browserPlan: PlanPreview | undefined;
    if (isBrowserWrite(toolCall.name)) {
      try {
        browserPlan = await prepareBrowserCall(toolCall.name, toolCall.params);
        ctx.abort.check();
      } catch (error) {
        ctx.abort.check();
        const body = `ERROR: ${safeBrowserText((error as Error).message)}`;
        results.push(section(toolCall, key, body));
        trouble.push(`${toolCall.name} (plan failed)`);
        ctx.store.addResult({ toolName: toolCall.name, success: false, result: body, timestamp: Date.now() });
        continue;
      }
    }
    const decision = requiresApproval(toolCall)
      ? await requestApproval(ctx, {
          browserPlan,
          toolCall,
          fingerprint,
          remaining: toolCalls.length - index - 1,
        })
      : AUTO_APPROVED;

    if (!decision.approved) {
      if (browserPlan) void browserRequest({ action: 'cancel', planId: browserPlan.id });
      // Reported as a tool result rather than aborting the round: the AI has to
      // learn this specific call was refused, and why, or its next move is the same
      // statement again.
      const refusal = decision.reason
        ? `CANCELLED: The user rejected this operation. Their reason: ${decision.reason}\n` +
          `Do not retry it unchanged — address the objection, or call complete_task with status ` +
          `"infeasible" explaining what you would need.`
        : `CANCELLED: The user rejected this operation without giving a reason.\n` +
          `Do not retry it unchanged — take the safest alternative reading of the request, or call ` +
          `complete_task with status "infeasible".`;

      console.log('[AgentLoop] Rejected by user:', toolCall.name);
      ctx.store.addResult({
        toolName: toolCall.name,
        description: toolCall.description,
        success: false,
        result: refusal,
        timestamp: Date.now(),
      });
      ctx.store.recordExecutedCall(fingerprint, {
        toolName: toolCall.name,
        isWrite: getToolRisk(toolCall) === 'write',
        success: false,
        rejected: true,
        timestamp: Date.now(),
        source: 'engine',
      });
      // `record`, not `settle`: a refusal skips `begin` — nothing ran, so there was
      // no window to guard — but it still needs a row, because "you turned this down"
      // is an outcome the card must be able to show after a reload.
      if (!isBrowserTool(toolCall.name)) void toolCallRecorder.record(
        {
          key,
          round: ctx.round,
          orderIndex: index,
          toolName: toolCall.name,
          description: toolCall.description,
          params: toolCall.params,
          isWrite: getToolRisk(toolCall) === 'write',
        },
        { status: 'rejected', resultBody: refusal },
      );
      results.push(section(toolCall, key, refusal));
      trouble.push(`${toolCall.description || toolCall.name} (refused)`);
      continue;
    }

    // ── Execute ────────────────────────────────────────────────────────────
    ctx.store.setCurrentTool(toolCall.name);
    console.log(`[AgentLoop] Executing: ${toolCall.name}`, toolCall.params);
    ctx.events.emit('tool:executing', { toolName: toolCall.name, params: toolCall.params });

    /**
     * Filed as `running` *before* the call, not after.
     *
     * A write that lands and then loses its tab — a reload mid-execution — is the one
     * case nothing else can reconstruct: the database already changed and no result
     * exists anywhere. A row left at `running` is how the next page load knows to say
     * "this may have gone through" instead of quietly offering to run it again.
     */
    if (!isBrowserTool(toolCall.name)) await toolCallRecorder.begin({
      key,
      round: ctx.round,
      orderIndex: index,
      toolName: toolCall.name,
      description: toolCall.description,
      params: toolCall.params,
      isWrite: getToolRisk(toolCall) === 'write',
    });

    let result: string;
    if (browserPlan) {
      const cancel = () => { void browserRequest({ action: 'cancel', planId: browserPlan!.id }); };
      ctx.abort.signal.addEventListener('abort', cancel);
      try {
        ctx.abort.check();
        const outcome = await browserRequest<{ status: string }>({ action: 'commit', planId: browserPlan.id });
        result = `${outcome.status === 'applied' ? '' : 'ERROR: '}${JSON.stringify(outcome)}`;
      } catch (error) { result = `ERROR: ${safeBrowserText((error as Error).message)}`; }
      finally { ctx.abort.signal.removeEventListener('abort', cancel); }
    } else result = await executeToolCall(toolCall);
    const success = isSuccess(result);

    ctx.events.emit('tool:executed', {
      toolName: toolCall.name,
      success,
      result: result.substring(0, 200), // Truncated — events are for observers, not payloads
    });

    // ── Guard: consecutive failures ────────────────────────────────────────
    // Always recorded: a success here resets the failure streak.
    const failure = ctx.breaker.recordToolResult(
      toolCall.name,
      success,
      success ? undefined : result,
    );
    let body = result;

    if (failure) {
      // Escalating hints, so the AI stops retrying the same broken approach
      body = ctx.breaker.getProgressiveErrorGuidance(result, toolCall.name);

      if (failure.action === 'stop') {
        console.warn('[AgentLoop] Circuit breaker: failure hard stop');
        ctx.events.emit('tool:error', { toolName: toolCall.name, error: failure.message });
        // Recorded before halting, so the step list shows the failure that tripped it
        ctx.store.addResult({
          toolName: toolCall.name,
          description: toolCall.description,
          success: false,
          result: body,
          timestamp: Date.now(),
        });
        const haltedSection = section(toolCall, key, `${body}\n\n${failure.message}`);
        if (!isBrowserTool(toolCall.name)) void toolCallRecorder.settle(key, { status: 'failed', resultBody: body });
        results.push(haltedSection);
        return halt(ctx, results, 'Too many failures in a row. Review the errors above, then retry.');
      }

      if (failure.action === 'warn') body += `\n\n${failure.message}`;
    }

    ctx.store.addResult({
      toolName: toolCall.name,
      // The AI's own wording — shown in the Agent tab instead of the tool name
      description: toolCall.description,
      success,
      result: body,
      timestamp: Date.now(),
    });

    // Recorded so the call's card in the chat can show what became of it
    ctx.store.recordExecutedCall(fingerprint, {
      toolName: toolCall.name,
      isWrite: getToolRisk(toolCall) === 'write',
      success,
      timestamp: Date.now(),
      source: 'engine',
    });

    /**
     * ⚠️ No body for a tool whose result is never reported back.
     *
     * `result_body` means "the AI is still owed this", and a leftover one is read as
     * unfinished business the dock offers to send. `complete_task` and the handoff
     * tools end the session where they stand, so they are owed nothing — storing their
     * body produced a card offering to send the AI its own `__TASK_COMPLETE__` marker,
     * one message after the task had visibly finished.
     */
    if (!isBrowserTool(toolCall.name)) void toolCallRecorder.settle(key, {
      status: success ? 'ok' : 'failed',
      resultBody: deliversResultToAI(toolCall.name) ? body : null,
    });

    results.push(section(toolCall, key, body));
    if (!success) trouble.push(`${toolCall.description || toolCall.name} (failed)`);

    // ── Session-ending signals ─────────────────────────────────────────────

    // A handoff tool navigated the tab away from this conversation. Nothing left to
    // send results into, and no turn coming back — end here rather than staging a
    // reply on a page that is being torn down.
    if (success && isHandoffTool(toolCall.name)) {
      console.log(`[AgentLoop] Handoff to ${toolCall.name}, ending session`);
      ctx.store.setCurrentTool(null);
      ctx.finish('complete');
      return { kind: 'ended' };
    }

    const completion = parseCompleteTaskSignal(result);

    /**
     * A completion announced on top of something that just went wrong is not accepted.
     *
     * The AI regularly issues several writes and a `complete_task` in one response.
     * Results are only sent back on the *next* round, so when the round ends here it
     * never learns whether those writes landed — and it has already told the user they
     * did. If one of them failed, or the user refused it, the transcript ends with a
     * confident success over a database that was not changed.
     *
     * So the round is handed off instead of finishing: the AI reads what actually
     * happened and either fixes it or reports honestly. Only the failure case is
     * intercepted — when everything worked, its verdict stands and the session ends
     * normally, because second-guessing a clean run would just cost an extra round.
     *
     * The prompt asks for the same thing (see `soul.ts`), but a prompt cannot be the
     * only defence here: this is the class of mistake that leaves wrong data behind
     * while telling the user it didn't.
     */
    if (completion && trouble.length > 0) {
      console.warn(
        '[AgentLoop] complete_task arrived alongside failures; reporting instead of ending',
        trouble,
      );
      // The completion marker itself is not a result — drop it and say why, or the AI
      // reads its own `__TASK_COMPLETE__` back and treats the task as closed.
      results.pop();
      results.push(
        `### ⚠️ Completion Not Accepted\n` +
          `You called complete_task in the same response as ${trouble.length} step(s) that did not ` +
          `succeed: ${trouble.join('; ')}.\n\n` +
          `Their results are above — you had not seen them when you declared the task done, so that ` +
          `verdict was premature and has been discarded. Read what actually happened, then either ` +
          `fix it and continue, or call complete_task again with an honest status ("partial" or ` +
          `"infeasible") describing what did not work. Do not simply repeat the same completion.`,
      );
      ctx.store.setCurrentTool(null);
      ctx.events.emit('loop:round-completed', {
        round: ctx.round,
        toolCallCount: toolCalls.length,
      });
      return { kind: 'results', results };
    }

    if (completion) {
      console.log(`[AgentLoop] Task explicitly ended (${completion.status}):`, completion.summary);
      ctx.store.addResult({
        toolName: 'complete_task',
        description: completion.summary,
        // "Cannot be done" is a legitimate verdict, but marking it successful would
        // paint the summary card green for a task that delivered nothing.
        success: completion.status !== 'infeasible',
        result: completion.summary,
        timestamp: Date.now(),
      });
      ctx.store.setCurrentTool(null);
      ctx.finish(completion.status === 'infeasible' ? 'infeasible' : 'complete');
      return { kind: 'ended' };
    }

    /**
     * ⚠️ `startsWith`, not `includes`.
     *
     * `includes('PAYWALL')` searched the entire result, so an ordinary SELECT whose
     * rows contained the word ended the session and showed the upgrade card — and
     * dumping `messages.content` is routine, so any conversation discussing
     * subscriptions was enough to trigger it. Only the first line is the verdict; the
     * rest is data the AI asked for.
     */
    if (result.startsWith(PAYWALL_SIGNAL)) {
      console.log('[AgentLoop] Paywall hit, stopping');
      ctx.store.setCurrentTool(null);
      ctx.finish('paywall');
      return { kind: 'ended' };
    }
  }

  ctx.store.setCurrentTool(null);
  ctx.abort.check();
  ctx.events.emit('loop:round-completed', { round: ctx.round, toolCallCount: toolCalls.length });

  return { kind: 'results', results };
}

/**
 * A tripped breaker stops the round but does not throw the report away.
 *
 * The caller stages `results` in the composer and pauses, so the user sees what went
 * wrong and "Retry" hands the errors to the AI instead of restarting a wait for a
 * message that was never sent.
 */
function halt(ctx: LoopContext, results: string[], reason: string): ExecuteOutcome {
  ctx.store.setCurrentTool(null);
  return { kind: 'halted', results, reason };
}
