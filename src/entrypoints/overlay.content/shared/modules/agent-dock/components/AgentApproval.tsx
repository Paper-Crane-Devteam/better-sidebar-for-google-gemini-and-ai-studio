/**
 * AgentApproval — the fallback place to approve a tool call.
 *
 * The primary place is the call's own card in the chat. This copy exists because
 * those cards only render in our own conversation view, and the user can switch back
 * to Gemini's native rendering mid-task — without a mirror here, the engine would be
 * parked with no reachable way to answer it. The two are kept deliberately alike,
 * down to folding the statement away, so answering from either reads the same.
 *
 * Same pending object, same resolve. Whichever is answered first wins.
 */

import React, { useState } from 'react';
import { AlertTriangle, FastForward, Play, Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { getToolLabel } from '../../agent-loop/tool-labels';
import type { ApprovalScope } from '../../agent-loop/types';
import { isBrowserWrite } from '@/shared/browser-agent/contracts';
import { BrowserPlanPreview } from '../../browser-agent/BrowserPlanPreview';

export const AgentApproval: React.FC = () => {
  const { t } = useI18n();
  const pendingApproval = useAgentLoopStore((s) => s.pendingApproval);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  if (!pendingApproval) return null;

  const { toolName, description, params, risk, remaining, resolve, browserPlan } = pendingApproval;
  const isWrite = risk === 'write';
  const detail = params.query || params.summary || params.ids || '';
  /** What the AI said it's doing, falling back to a label when it said nothing. */
  const summary = description || getToolLabel(toolName, t, params.query);

  /**
   * The AI's plain-language account of what this changes — the thing the decision is
   * actually made on.
   *
   * `description` is a one-line label of the *step* ("link candidate conversations to
   * tags"); it never says which conversations, which tags, or how many, so there is
   * nothing in it to approve or refuse. This field is asked for precisely to fill that
   * gap, and it is why the SQL can move out of the way.
   */
  const changeSummary = params.change_summary?.trim();

  /**
   * Fall back to the raw statement only when the AI didn't explain itself.
   *
   * SQL in front of someone who cannot read SQL is not a safeguard, it is furniture —
   * so it is gone whenever there is something better to show. But *nothing* readable is
   * worse than SQL, so the toggle comes back when the summary is missing.
   */
  const showSqlFallback = !changeSummary && !!detail;

  const decide = (approved: boolean, scope: ApprovalScope = 'once') => {
    resolve({ approved, scope, reason: approved ? undefined : reason.trim() || undefined });
    setRejecting(false);
    setReason('');
  };

  return (
    <div
      className={cn(
        'space-y-2 rounded-md p-3',
        isWrite ? 'bg-orange-500/10' : 'bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2">
        {isWrite ? (
          <AlertTriangle className="h-3 w-3 shrink-0 text-orange-500" />
        ) : (
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {isWrite
            ? t('agent.approve.writeTitle', { defaultValue: 'Approve this change?' })
            : t('agent.approve.readTitle', { defaultValue: 'Approve this query?' })}
        </span>
      </div>

      {/* The headline: which step this is. */}
      <p className="text-sm font-medium leading-relaxed text-foreground">{summary}</p>
      {browserPlan && <BrowserPlanPreview plan={browserPlan} />}

      {/* What it will actually do, in the user's language. Shown in full rather than
          folded — this is the decision, not a detail behind it. Capped in height because
          the AI writes it and a long list shouldn't push the buttons off screen. */}
      {changeSummary && (
        <div className="max-h-[220px] overflow-y-auto rounded border border-border/40 bg-background/50 px-2.5 py-2">
          <MarkdownRenderer className="text-xs text-foreground">
            {changeSummary}
          </MarkdownRenderer>
        </div>
      )}

      {/* No explanation from the AI, so the statement is all there is. Ugly, but a write
          you cannot inspect at all is worse — see the note on `showSqlFallback`. To read
          the SQL when a summary *was* given, expand the call's card in the agent view. */}
      {showSqlFallback && (
        <div className="space-y-1.5">
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
            <div className="max-h-[160px] overflow-auto rounded border border-border/50 bg-background/60 p-2">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                {detail}
              </pre>
            </div>
          )}
        </div>
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
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => setRejecting(false)}
            >
              {t('agent.approve.back', { defaultValue: 'Back' })}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs"
              onClick={() => decide(false)}
            >
              {t('agent.approve.reject', { defaultValue: 'Reject' })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-6 gap-1 text-xs" onClick={() => decide(true)}>
              <Play className="h-3 w-3" />
              {t('agent.approve.run', { defaultValue: 'Run' })}
            </Button>
            {!isBrowserWrite(toolName) && remaining > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 text-xs"
                onClick={() => decide(true, 'round')}
              >
                <FastForward className="h-3 w-3" />
                {t('agent.approve.runRest', {
                  defaultValue: 'Run these {{count}} too',
                  count: remaining,
                })}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 text-xs text-muted-foreground"
              onClick={() => setRejecting(true)}
            >
              {t('agent.approve.reject', { defaultValue: 'Reject' })}
            </Button>
          </div>
          {!isBrowserWrite(toolName) && <button
            type="button"
            onClick={() => decide(true, 'task')}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t('agent.approve.allTask', { defaultValue: "Don't ask again for this task" })}
          </button>}
        </div>
      )}
    </div>
  );
};
