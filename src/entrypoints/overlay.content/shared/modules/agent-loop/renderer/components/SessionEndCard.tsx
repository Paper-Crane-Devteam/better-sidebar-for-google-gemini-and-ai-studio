/**
 * SessionEndCard — the "that's the end of the task" marker in the conversation.
 *
 * It reads as one more AI turn, because that is what it is: `complete_task`'s
 * `summary` is the AI's closing word on the job, and the only thing separating it
 * from the prose above is a tick in the gutter.
 *
 * ## Why not a divider
 *
 * It used to be a full-width rule with a verdict in the middle and the summary set
 * below it in small centred grey type. Two problems with that. The rule announces a
 * chapter break the reader didn't ask for — after a five-second question it reads as
 * the feature having closed on them, which is why there used to be a second, compact
 * form, plus a whole pass over the transcript to weigh a session and decide which form
 * it deserved. And the summary, the one piece of writing on screen that says what
 * actually happened, was set as a footnote to the rule.
 *
 * Rendered as a turn, both go away: the summary sits in the reading column at reading
 * size, and a session that did little simply produces a short one. No second form to
 * pick between, so the weighing that fed it is gone too.
 *
 * ## When the turn already spoke
 *
 * A model turn can carry prose of its own alongside the completion call, and then the
 * summary is a paraphrase of the paragraph directly above it. In that case the marker
 * steps aside entirely (`hasOwnText`) and the turn renders as any other AI reply —
 * saying the same thing twice, once in full and once in miniature, was the worst of
 * the old layout.
 *
 * ## What it still owns
 *
 * The primary undo entry point. The dock can be collapsed, dismissed, or left behind
 * by switching conversations, while this sits at the bottom of the transcript — which
 * is where someone looking over what the agent did actually is when they decide they
 * want it reverted. So the footer renders even when the marker itself has stepped
 * aside.
 *
 * ## The follow-up hint
 *
 * The one thing the marker cannot say by itself is what comes next. A follow-up
 * message keeps the agent going — the AI still has the system prompt, so it answers in
 * tool format and auto-pickup takes over — but nothing on screen suggests that, so
 * people retype `>` or open a new chat. The hint says it once or twice and then gets
 * out of the way for good (`useOnboardingHint`, retired the moment a follow-up is
 * actually picked up).
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, Undo2, RotateCcw, X } from 'lucide-react';
import type { SessionOutcome } from '../helpers/session-end';
import { useI18n } from '@/shared/hooks/useI18n';
import { useOnboardingHint } from '@/shared/lib/onboarding-store';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { useUndoAvailable, useUndoWasUndone, useUndoAction } from '../../undo';

interface SessionEndCardProps {
  outcome: SessionOutcome;
  /** The AI's own account of what it did. Empty when the call carried none. */
  summary?: string;
  /**
   * Whether this marker owns the undo entry point.
   *
   * A conversation can contain several finished sessions, but the snapshot only ever
   * covers the most recent one — offering "Undo changes" on an older marker would
   * revert work the user never pointed at.
   */
  isLatest?: boolean;
  /**
   * Whether the turn this closes already said something in its own words.
   *
   * When it did, the summary is a restatement of it and the marker keeps quiet; the
   * turn is left to read as a plain AI reply. Passed in because working it out means
   * looking at the prose either side of the tool blocks, which is the response
   * component's business, not this one's.
   */
  hasOwnText?: boolean;
}

export const SessionEndCard: React.FC<SessionEndCardProps> = ({
  outcome,
  summary = '',
  isLatest = true,
  hasOwnText = false,
}) => {
  const { t } = useI18n();
  const undoAvailable = useUndoAvailable() && isLatest;
  const undone = useUndoWasUndone() && isLatest;
  const { undoing, runUndo } = useUndoAction();

  // Only the newest marker: the hint is about what to do *now*, and hanging it on
  // every historical marker would turn a one-off tip into wallpaper.
  const hint = useOnboardingHint('agentContinueAfterEnd', 3);
  const showHint = isLatest && !undone && hint.visible;

  const isSuccess = outcome === 'complete';

  const label = {
    complete: t('agent.summary.done', { defaultValue: 'Task finished' }),
    // Distinct from both: the AI got somewhere but not all the way, and the summary
    // right below says how far. Reading that as a plain success is the version that
    // sends people off believing work happened that didn't.
    partial: t('agent.summary.partial', { defaultValue: 'Partly done' }),
    infeasible: t('agent.summary.infeasible', { defaultValue: "Couldn't be done" }),
  }[outcome];

  // Reverted wins over the outcome: the transcript above still describes changes
  // that no longer exist, so "Task finished" alone would read as confirmation.
  const Icon = undone ? RotateCcw : isSuccess ? CheckCircle2 : AlertTriangle;
  const iconColor = undone
    ? 'text-muted-foreground'
    : isSuccess
      ? 'text-success'
      : 'text-warning';

  /**
   * The body of the marker turn.
   *
   * The summary when there is one — the AI wrote it to be read, so it gets the same
   * treatment as any other thing the AI writes. The verdict label only stands in when
   * the call carried no summary at all, which means a malformed call.
   *
   * Suppressed once the changes are gone: the summary describes work that has been
   * rolled back, and leaving it under a tick reads as a contradiction. The revert
   * itself becomes the whole message.
   */
  const body = undone ? (
    <span className="text-sm text-muted-foreground">
      {t('agent.undo.reverted', { defaultValue: 'Changes reverted' })}
    </span>
  ) : summary ? (
    <MarkdownRenderer className="leading-relaxed">{summary}</MarkdownRenderer>
  ) : (
    <span className="text-sm text-muted-foreground">{label}</span>
  );

  const footer = (undoAvailable || showHint) && (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {undoAvailable && (
        <button
          type="button"
          onClick={runUndo}
          disabled={undoing}
          className="-ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs
                     font-medium text-[rgb(var(--highlight))] transition-colors
                     hover:bg-[rgb(var(--highlight)/0.1)] disabled:opacity-50"
        >
          <Undo2 className="h-3 w-3" />
          {undoing
            ? t('agent.undo.working', { defaultValue: 'Undoing…' })
            : t('agent.undo.action', { defaultValue: 'Undo changes' })}
        </button>
      )}

      {showHint && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground/80">
            {t('agent.summary.continueHint', {
              defaultValue: 'Just keep talking to carry on — no need to type > again.',
            })}
          </span>
          <button
            type="button"
            onClick={hint.dismiss}
            aria-label={t('agent.summary.hintDismiss', { defaultValue: 'Got it' })}
            title={t('agent.summary.hintDismiss', { defaultValue: 'Got it' })}
            className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors
                       hover:bg-accent/40 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );

  /**
   * The turn spoke for itself, so there is nothing left to announce — only the
   * controls that have nowhere else to live. A revert still gets its line, because
   * that one contradicts the prose above it and has to be said out loud.
   */
  if (hasOwnText && !undone) {
    if (!footer) return null;
    // No gutter here: with no icon to align to, the controls belong on the same
    // column as the prose they follow.
    return <div className="-mt-3 mb-6 w-full">{footer}</div>;
  }

  return (
    /* Same vertical rhythm as CustomModelResponse: this is a turn, not an interlude.
       The icon sits in a fixed gutter so the text lands on one column whether it is
       one line or three paragraphs. */
    <div className="my-6 flex w-full items-start gap-2 text-[rgb(var(--foreground))]">
      <Icon className={`mt-[3px] h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        {body}
        {footer}
      </div>
    </div>
  );
};
