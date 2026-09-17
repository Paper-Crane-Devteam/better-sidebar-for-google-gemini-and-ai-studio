/**
 * One recorded batch: the browser as it was before it ran, as it was after, and the way back
 * to either.
 *
 * ## Why this is a dialog on top of a dialog
 *
 * It used to be a second stage *inside* the Agent tab: clicking a record replaced the list
 * with these two trees, and a "back to records" link was the way out. In a sidebar three
 * hundred pixels wide that meant a bookmark tree wrapped every line, and the panel below —
 * the permissions, the buttons — vanished while you were reading. Worse, the two things being
 * compared could not be seen at once, which is the entire reason to show before *and* after.
 *
 * So the record list is a dialog, and this is a dialog over it. The stack is what makes that
 * work: the list stays mounted underneath, keeps its page, and reloads when this one closes
 * having changed something.
 *
 * ## Two stages, same window
 *
 * Picking a side prepares a restore and replaces the pair with that plan — so the tree being
 * approved is the same tree that was just clicked, now annotated with what will change. The
 * approve/cancel buttons live in the body rather than the dialog footer, because which
 * buttons are right depends on state this component owns and the footer is fixed at open
 * time.
 *
 * ⚠️ **A prepared plan is armed in the background until something disposes of it.** Every
 * exit has to go through `release()` — including closing the dialog, which is why the unmount
 * cleanup exists rather than trusting the two buttons.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  RESTORE_TOOL,
  type BatchTrees,
  type PlanPreview,
  type RestoreSide,
  type TreeNode,
} from '@/shared/browser-agent/contracts';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import {
  browserRequest,
  cancelBrowserPlan,
  commitBrowserPlan,
} from '../../agent-loop/browser/browser-store';
import { BrowserPlanPreview } from '../../agent-loop/browser/BrowserPlanPreview';
import { BrowserTree } from '../../agent-loop/browser/BrowserTree';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import type { JournalEntry } from './journal';

const BrowserBatchContent: React.FC<{ entry: JournalEntry; onChanged: () => void }> = ({
  entry,
  onChanged,
}) => {
  const { t } = useI18n();
  /**
   * A live session blocks restoring.
   *
   * Restoring while the agent is mid-task would have it planning against a browser that
   * changed under it — and the state it reasoned from is exactly what a restore rewinds.
   */
  const running = useAgentLoopStore((s) => s.status !== 'idle');

  const [trees, setTrees] = useState<BatchTrees | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** The armed plan's id, mirrored where the unmount cleanup can reach it. */
  const armed = useRef<string | null>(null);
  const release = () => {
    if (armed.current) cancelBrowserPlan(armed.current);
    armed.current = null;
  };
  useEffect(() => release, []);

  /** Every action here talks to the background, so every action can fail out loud. */
  const work = (fn: () => Promise<void>) => {
    void (async () => {
      setBusy(true);
      setError('');
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  };

  useEffect(() => {
    work(async () =>
      setTrees(await browserRequest<BatchTrees>({ action: 'trees', batchId: entry.batch_id })),
    );
    // Loaded once, for the batch this dialog was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.batch_id]);

  const askRestore = (side: RestoreSide) =>
    work(async () => {
      const prepared = await browserRequest<PlanPreview>({
        action: 'prepare',
        tool: RESTORE_TOOL,
        params: { batch_id: entry.batch_id, side },
      });
      armed.current = prepared.id;
      setPlan(prepared);
    });

  const approve = (planId: string) =>
    work(async () => {
      const result = (await commitBrowserPlan(planId)) as {
        status: string;
        completed: number;
        planned: number;
        error?: string;
      };
      // Committed, so there is nothing left to dispose of.
      armed.current = null;
      setPlan(null);
      toast.info(
        t('agent.browser.panel.outcome', {
          status: t(`agent.browser.status.${result.status}`, { defaultValue: result.status }),
          completed: result.completed,
          planned: result.planned,
          error: result.error ?? '',
          defaultValue: '{{status}}: {{completed}}/{{planned}}. {{error}}',
        }),
      );
      onChanged();
      useModalStore.getState().close();
    });

  if (!trees && !error) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      {plan ? (
        <>
          <BrowserPlanPreview plan={plan} />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy || running} onClick={() => approve(plan.id)}>
              {t('agent.browser.panel.approveRestore', { defaultValue: 'Approve and restore' })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                release();
                setPlan(null);
              }}
            >
              {t('agent.browser.panel.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </>
      ) : (
        <>
          <StateBlock
            heading={t('agent.browser.panel.before', { defaultValue: 'Before' })}
            nodes={trees?.before}
            onRestore={entry.can_restore_before ? () => askRestore('before') : undefined}
            busy={busy || running}
          />
          <StateBlock
            heading={t('agent.browser.panel.after', { defaultValue: 'After' })}
            nodes={trees?.after}
            onRestore={entry.can_restore_after ? () => askRestore('after') : undefined}
            busy={busy || running}
          />
          {running && (
            <p className="text-muted-foreground">
              {t('agent.browser.panel.busySession', {
                defaultValue:
                  'A task is running. Restoring would change the browser it is working on, so it waits until the task ends.',
              })}
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * One recorded state, with its own way back.
 *
 * ⚠️ Absent nodes and an empty tree are different answers, and the missing one is always
 * the `after` of a batch that never finished. Saying so is the point: nobody knows what
 * state that batch ended in, so there is nothing to draw and nothing to restore.
 */
function StateBlock({
  heading,
  nodes,
  onRestore,
  busy,
}: {
  heading: string;
  nodes?: TreeNode[];
  onRestore?: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5 rounded-md border border-border/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-foreground">{heading}</strong>
        {nodes && onRestore && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onRestore}>
            {t('agent.browser.panel.revertToThis', { defaultValue: 'Revert to this' })}
          </Button>
        )}
      </div>
      {nodes ? (
        <div className="max-h-72 overflow-auto">
          <BrowserTree nodes={nodes} />
        </div>
      ) : (
        <p className="text-muted-foreground">
          {t('agent.browser.panel.noEndState', {
            defaultValue: 'This batch did not finish, so no end state was recorded.',
          })}
        </p>
      )}
    </div>
  );
}

/**
 * Open the detail dialog over the record list.
 *
 * Keyed by batch so double-clicking a row cannot stack two copies of the same state.
 * `onChanged` fires only when a restore actually landed, and the list underneath uses it to
 * reload — the journal has a new batch in it at that point.
 */
export function openBrowserBatchModal(entry: JournalEntry, onChanged: () => void) {
  useModalStore.getState().open({
    id: `browser-agent-batch-${entry.batch_id}`,
    type: 'info',
    title: `${i18n.t('agent.browser.panel.detail', { defaultValue: 'Before and after' })} · ${new Date(entry.created_at).toLocaleString()}`,
    content: <BrowserBatchContent entry={entry} onChanged={onChanged} />,
    confirmText: i18n.t('common.close'),
    modalClassName: 'max-w-2xl',
  });
}
