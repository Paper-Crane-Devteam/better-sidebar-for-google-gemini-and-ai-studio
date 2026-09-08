/**
 * ToolCallWidget — one card per tool call detected in a model response.
 *
 * The card is where you approve. When the engine reaches a call that needs the
 * user's go-ahead it parks and publishes the call's fingerprint; the matching card
 * lights up with the buttons, and answering resolves the engine's wait.
 *
 * It used to be the other way round: this button ran the tool *itself*, appended the
 * result to the composer, and left the user to send it — a second execution path
 * alongside the engine's. Keeping the two from colliding required a ledger of
 * executed fingerprints, a disabled state whenever the engine was busy, and there
 * was still a check-then-act race, because the engine only claimed a fingerprint
 * after finishing. One path removes all of it.
 *
 * Every other card is read-only: what the AI asked for, and what became of it.
 */

import React, { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  Settings,
  Play,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  FastForward,
  Ban,
  HelpCircle,
} from 'lucide-react';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import type { ParsedToolCall } from '../../types';
import { parseToolCallFromText, extractToolInfo } from '../helpers/tool-parser';
import type { DerivedToolOutcome } from '../helpers/tool-outcomes';
import { useAgentLoopStore } from '../../agent-loop-store';
import { useAgentRecordStore } from '../../agent-record-store';
import {
  buildToolCallFingerprint,
  buildToolCallKey,
  isControlTool,
} from '../../execution-policy';
import { getToolLabel } from '../../tool-labels';
import { isImeComposing } from '@/entrypoints/overlay.content/shared/lib/ime';

interface ToolCallWidgetProps {
  toolName?: string;
  description?: string;
  query?: string;
  rawText: string;
  /** Only the newest model turn can hold a call the engine is still waiting on */
  isLatestResponse?: boolean;
  /**
   * What became of this call according to the conversation itself, for turns the
   * live session's ledger knows nothing about — anything from before a reload.
   */
  outcome?: DerivedToolOutcome | null;
  parseToolCall?: (text: string) => ParsedToolCall | null;
}

export const ToolCallWidget: React.FC<ToolCallWidgetProps> = ({
  toolName: propToolName,
  description: propDescription,
  query: propQuery,
  rawText,
  isLatestResponse = false,
  outcome = null,
  parseToolCall = parseToolCallFromText,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  const info = extractToolInfo(rawText);
  const toolName = propToolName || info.toolName;
  const description = propDescription || info.description;
  const query = propQuery || info.query;
  /**
   * The AI's plain-language account of what this call changes.
   *
   * The approval decision rests on this rather than on the SQL, so it is also what the
   * card leads with when opened — the statement follows underneath for whoever wants it.
   */
  const changeSummary = info.changeSummary;

  /**
   * The card's headline. The AI's own description reads as an intent ("find chats
   * older than a year"); the tool name reads as an implementation detail, so it
   * only stands in when there's no description at all.
   */
  const summary = description || getToolLabel(toolName, t, query);

  const parsed = useMemo(() => parseToolCall(rawText), [rawText, parseToolCall]);
  const fingerprint = useMemo(
    () => (parsed ? buildToolCallFingerprint(parsed) : null),
    [parsed],
  );
  /**
   * The same identity, digested — this is how the card finds its own row, and the same
   * value the engine wrote into the result section it sent to the AI. Recomputed here
   * rather than passed in, which is the whole point of using a digest instead of a
   * random id: the card needs nothing but the call it is already rendering.
   */
  const joinKey = useMemo(() => (parsed ? buildToolCallKey(parsed) : null), [parsed]);

  const executedCall = useAgentLoopStore((s) =>
    fingerprint ? s.executedCalls[fingerprint] : undefined,
  );
  const recorded = useAgentRecordStore((s) => (joinKey ? s.records[joinKey] : undefined));
  const pendingApproval = useAgentLoopStore((s) => s.pendingApproval);
  const currentTool = useAgentLoopStore((s) => s.currentTool);

  /**
   * Three sources, narrowest first.
   *
   * The live session's ledger is first-hand and current. The stored row is first-hand
   * but from a previous page life. The transcript is a reconstruction, and last —
   * though it is the only one that covers a conversation run on another machine or
   * before any of this was recorded.
   */
  const status: { success: boolean; rejected: boolean } | null = executedCall
    ? { success: executedCall.success, rejected: Boolean(executedCall.rejected) }
    : recorded?.settled
      ? { success: recorded.success, rejected: recorded.rejected }
      : outcome;

  /**
   * A row still marked `running` after a reload: the tool was invoked and the page
   * went away before the result came back.
   *
   * Reported as uncertain rather than resolved, and this is the case the row exists
   * for. Falling back to "Not run" on a write would invite running it a second time,
   * which is exactly the double-write this ledger is here to prevent.
   */
  const indeterminate = !status && recorded?.status === 'running';

  /** The result is still owed to the AI — it never made it into the conversation */
  const undelivered = Boolean(recorded && recorded.settled && !recorded.delivered);

  // Control tools never take an approval: `complete_task` just ends the session, so
  // there is nothing to allow or refuse. The policy agrees — `requiresApproval` is
  // false for them — so this is belt-and-braces, not the enforcement point.
  const engineOnly = isControlTool(toolName);
  const isPending =
    !engineOnly &&
    isLatestResponse &&
    fingerprint !== null &&
    pendingApproval?.fingerprint === fingerprint;

  const running = !status && !indeterminate && currentTool === toolName && isLatestResponse;

  /**
   * The output to show when the card is opened.
   *
   * Normally the transcript's copy. For a call whose result never got sent, the stored
   * row is holding the only copy there is — the payload was staged in a composer that
   * no longer exists.
   */
  const output = outcome?.content ?? recorded?.content ?? null;

  const decide = (approved: boolean, scope: 'once' | 'round' | 'task' = 'once') => {
    if (!pendingApproval) return;
    pendingApproval.resolve({
      approved,
      scope,
      reason: approved ? undefined : reason.trim() || undefined,
    });
    setRejecting(false);
    setReason('');
  };

  const renderStatus = () => {
    if (engineOnly) {
      return (
        <span className="ml-auto shrink-0 px-2 py-1 text-xs text-muted-foreground">
          {t('agent.summary.done', { defaultValue: 'Task finished' })}
        </span>
      );
    }

    if (isPending) {
      return (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-warning/20 px-2 py-1 text-xs font-medium text-warning">
          {t('agent.tool.waiting', { defaultValue: 'Waiting for you' })}
        </span>
      );
    }

    if (running) {
      return (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />{' '}
          {t('agent.tool.running', { defaultValue: 'Running' })}
        </span>
      );
    }

    if (indeterminate) {
      return (
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-warning"
          title={t('agent.tool.interruptedTitle', {
            defaultValue:
              'This was started but the page reloaded before the result came back, so we cannot tell whether it finished.',
          })}
        >
          <HelpCircle className="h-3 w-3" />{' '}
          {t('agent.tool.interrupted', { defaultValue: 'May have run' })}
        </span>
      );
    }

    if (!status) {
      return (
        <span className="ml-auto shrink-0 px-2 py-1 text-xs text-muted-foreground">
          {t('agent.tool.notRun', { defaultValue: 'Not run' })}
        </span>
      );
    }

    if (status.rejected) {
      return (
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-muted-foreground"
          title={t('agent.tool.rejectedTitle', { defaultValue: 'You turned this one down' })}
        >
          <Ban className="h-3 w-3" /> {t('agent.tool.rejected', { defaultValue: 'Rejected' })}
        </span>
      );
    }

    return (
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
        {status.success ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-success" />{' '}
            {t('agent.tool.done', { defaultValue: 'Done' })}
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3 text-destructive" />{' '}
            {t('agent.tool.failed', { defaultValue: 'Failed' })}
          </>
        )}
        {/* Ran, but the AI never heard about it. Worth saying on the card as well as
            in the dock's recovery prompt: this is the card whose work is stranded. */}
        {undelivered && (
          <span
            className="text-warning"
            title={t('agent.tool.undeliveredTitle', {
              defaultValue: 'This ran, but its result never reached the AI.',
            })}
          >
            · {t('agent.tool.undelivered', { defaultValue: 'not reported' })}
          </span>
        )}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'my-2 overflow-hidden rounded-lg text-foreground transition-colors',
        isPending ? 'bg-warning/10' : 'bg-success/10',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs transition-colors',
          isPending ? 'hover:bg-warning/15' : 'hover:bg-success/15',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center',
            isPending ? 'text-warning' : 'text-success',
          )}
        >
          <Settings className="h-4 w-4" />
        </span>
        {/* `min-w-0 flex-1` rather than a fixed max-width: the old cap ellipsised at
            280px no matter how much room was actually left on the row. */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] font-medium',
            isPending ? 'text-warning' : 'text-success',
          )}
          title={summary}
        >
          {summary}
        </span>

        {renderStatus()}

        <span className="ml-1 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </div>

      {/* Approval. Kept deliberately like AgentApproval in the dock, so answering from
          either reads the same: the plain-language account of the change is shown in
          full, and the SQL only stands in when the AI didn't write one. The statement is
          still reachable either way by expanding the card. */}
      {isPending && (
        <div className="space-y-2 bg-background/60 px-3 py-2">
          {changeSummary ? (
            <div className="max-h-[240px] overflow-y-auto rounded border border-border/40 bg-background/50 px-2.5 py-2">
              <MarkdownRenderer className="text-xs text-foreground">
                {changeSummary}
              </MarkdownRenderer>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowDetail(!showDetail)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showDetail
                  ? t('agent.approve.hideDetail', { defaultValue: 'Hide what will run' })
                  : t('agent.approve.showDetail', { defaultValue: 'Show what will run' })}
              </button>
              {showDetail && (
                <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-background/60 p-2 font-mono text-xs text-foreground">
                  {query || rawText}
                </pre>
              )}
            </>
          )}

          {rejecting ? (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                placeholder={t('agent.approve.reasonPlaceholder', {
                  defaultValue: "What's wrong with it? (optional)",
                })}
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  // Enter commits the IME candidate, not the rejection — see `isImeComposing`
                  if (isImeComposing(e.nativeEvent)) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    decide(false);
                  }
                }}
                className="w-full resize-none rounded-md border border-border/50 bg-background px-2 py-1
                           text-xs text-foreground placeholder:text-muted-foreground
                           focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('agent.approve.back', { defaultValue: 'Back' })}
                </button>
                <button
                  type="button"
                  onClick={() => decide(false)}
                  className="rounded bg-destructive/20 px-2 py-1 text-xs font-medium text-destructive"
                >
                  {t('agent.approve.reject', { defaultValue: 'Reject' })}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => decide(true)}
                className="inline-flex items-center gap-1 rounded bg-success/20 px-2 py-1 text-xs font-medium text-success hover:bg-success/30"
              >
                <Play className="h-3 w-3" /> {t('agent.approve.run', { defaultValue: 'Run' })}
              </button>
              {/* Only when there is actually a rest to approve */}
              {(pendingApproval?.remaining ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => decide(true, 'round')}
                  className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs text-foreground hover:bg-muted/60"
                >
                  <FastForward className="h-3 w-3" />
                  {t('agent.approve.runRest', {
                    defaultValue: 'Run these {{count}} too',
                    count: pendingApproval?.remaining ?? 0,
                  })}
                </button>
              )}
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="ml-auto rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {t('agent.approve.reject', { defaultValue: 'Reject' })}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body (collapsible) — the call, and its output when the conversation still
          carries it. Reading an old session, "what did that query return" is the
          question the card is opened to answer. */}
      {expanded && !isPending && (
        <div className="max-h-[300px] overflow-y-auto bg-background/50 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {/* The tool name lives down here now — it's a detail for whoever opens the
              card, not the first thing everyone else has to read past. */}
          <div className="mb-1.5 font-sans text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {t('agent.tool.nameLabel', { defaultValue: 'Action' })} · {toolName}
          </div>

          {/* What it changed, in words, above the statement that did it. This is the
              expansion the agent view exists to offer: the dock shows the same text at
              approval time but hides the SQL, so this is where it can be read. */}
          {changeSummary && (
            <div className="mb-2 font-sans whitespace-normal">
              <MarkdownRenderer className="text-xs text-foreground">
                {changeSummary}
              </MarkdownRenderer>
              <div className="mt-2 border-t border-border/40" />
              <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {t('agent.tool.statement', { defaultValue: 'Statement' })}
              </span>
            </div>
          )}
          {rawText}
          {output && (
            <>
              <div className="my-2 border-t border-border/40" />
              <span className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {t('agent.tool.output', { defaultValue: 'Output' })}
              </span>
              <div className="mt-1">{output}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
