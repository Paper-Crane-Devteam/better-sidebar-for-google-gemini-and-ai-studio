/**
 * BrowserView — the Browser agent's panel in the Agent tab.
 *
 * What the Workspace agent's file tree is to that agent, this is to this one: **the thing it
 * operates on, made visible.** Not a launcher. The way to start a task is `>` in the chat
 * input, the same as every other agent — this panel exists to answer the two questions the
 * composer cannot:
 *
 * | Question | Answer here |
 * |---|---|
 * | What is it allowed to touch? | the permission summary, and the way to change it |
 * | What has it already done to my browser? | the local journal, with undo |
 *
 * ⚠️ **The journal is the reason this panel is not optional.** Tabs and bookmarks are not
 * versioned and not diffable: once a batch lands, the only record that it happened — and the
 * only route back — is the snapshot the extension kept. Undo has to be reachable without a
 * running session, because the session that made the change is usually long over by the time
 * the user notices they want it back.
 *
 * It used to also hold a textarea and four "Organize tabs / groups / bookmarks" buttons that
 * filled the composer. Those are gone: they were a second, worse composer next to the real
 * one, and the four buttons were the same agent aimed four ways — a sentence the user can
 * simply type.
 */

import React, { useState } from 'react';
import { groupsOf, type EntityChange, type PlanPreview } from '@/shared/browser-agent/contracts';
import {
  browserRequest,
  cancelBrowserPlan,
  commitBrowserPlan,
  openBrowserAgentSettings,
  useBrowserAgent,
} from '../../agent-loop/browser/browser-store';
import {
  BrowserPlanPreview,
  BrowserState,
} from '../../agent-loop/browser/BrowserPlanPreview';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { useI18n } from '@/shared/hooks/useI18n';

interface JournalEntry {
  batch_id: string;
  tool: string;
  status: string;
  completed: number;
  planned: number;
  created_at: number;
  can_undo: boolean;
  error?: string;
}

/** The journal is read through the agent's own tool, so it obeys the same read permissions. */
const readJournal = (params: Record<string, string>) =>
  browserRequest<{ items: JournalEntry[] }>({
    action: 'read',
    tool: 'browser_query_changes',
    params,
  });

export const BrowserView: React.FC = () => {
  const { t } = useI18n();
  const settings = useBrowserAgent((s) => s.settings);
  const groups = groupsOf(settings.capabilities);
  /**
   * A live session blocks undo, not the whole panel.
   *
   * Undoing while the agent is mid-task would have it planning against a browser that changed
   * under it — and the snapshot it reasoned from is exactly what undo is rewinding.
   */
  const running = useAgentLoopStore((s) => s.status !== 'idle');

  const [journal, setJournal] = useState<JournalEntry[] | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [detail, setDetail] = useState<EntityChange[] | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const statusLabel = (status: string) =>
    t(`agent.browser.status.${status}`, { defaultValue: status });

  const load = async () => setJournal((await readJournal({ limit: '50' })).items);

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

  const showDetail = (batchId: string) =>
    work(async () => {
      const batch = await readJournal({ batch_id: batchId });
      const steps = (batch.items[0] as unknown as { steps?: Array<{ step_index: number }> })
        ?.steps ?? [];
      // Per step, because change rows are the one thing the journal pages: a batch of 30
      // moves can carry hundreds of them and they each hold a before/after snapshot.
      const pages = await Promise.all(
        steps.map((step) =>
          browserRequest<{ items: Array<{ changes?: { items: EntityChange[] } }> }>({
            action: 'read',
            tool: 'browser_query_changes',
            params: { batch_id: batchId, step_index: String(step.step_index), limit: '100' },
          }),
        ),
      );
      setDetail(pages.flatMap((page) => page.items[0]?.changes?.items ?? []));
      setNotice(
        t('agent.browser.panel.truncated', {
          defaultValue: 'Each step shows its first 100 changes.',
        }),
      );
    });

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 text-xs">
      <div className="space-y-2 rounded-md border border-border/50 p-3">
        <p>
          {t('agent.browser.panel.approvalNote', {
            defaultValue: 'Every change is approved, sorting included.',
          })}{' '}
          {/* Named, not counted. The settings window offers two switches over eight
              capabilities, so "6 enabled" would be a number the user has never seen. */}
          {groups.length
            ? t('agent.browser.panel.permissions', {
                list: groups
                  .map((g) => t(`agent.browser.settings.group.${g}`, { defaultValue: g }))
                  .join(' · '),
                defaultValue: 'Allowed: {{list}}',
              })
            : t('agent.browser.panel.noPermissions', {
                defaultValue: 'Permissions: none granted yet',
              })}
        </p>
        <p className="text-muted-foreground">
          {settings.shareFullUrls
            ? t('agent.browser.panel.urlsShared', { defaultValue: 'Full URLs: readable by the AI.' })
            : t('agent.browser.panel.urlsRedacted', { defaultValue: 'Full URLs: redacted.' })}{' '}
          {t('agent.browser.panel.auditNote', {
            defaultValue: 'The audit record stays on this machine.',
          })}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="underline"
            onClick={() => work(async () => void (await openBrowserAgentSettings()))}
          >
            {t('agent.browser.panel.openSettings', { defaultValue: 'Permissions and privacy' })}
          </button>
          <button type="button" disabled={busy} className="underline" onClick={() => work(load)}>
            {t('agent.browser.panel.viewHistory', { defaultValue: 'Local records' })}
          </button>
        </div>
      </div>

      {journal && (
        <div className="space-y-2">
          {journal.length === 0 ? (
            <p>
              {t('agent.browser.panel.noHistory', {
                defaultValue:
                  'No records to show. Reading history needs the matching permission too.',
              })}
            </p>
          ) : (
            journal.map((batch) => (
              <div key={batch.batch_id} className="rounded bg-muted/40 p-2">
                <div>
                  {new Date(batch.created_at).toLocaleString()} · {statusLabel(batch.status)} ·{' '}
                  {batch.completed}/{batch.planned}
                </div>
                {batch.error && <p className="text-destructive">{batch.error}</p>}
                <button
                  type="button"
                  className="mr-3 underline"
                  disabled={busy}
                  onClick={() => showDetail(batch.batch_id)}
                >
                  {t('agent.browser.panel.detail', { defaultValue: 'Detail' })}
                </button>
                <button
                  type="button"
                  className="underline disabled:opacity-40"
                  disabled={busy || running || !batch.can_undo}
                  onClick={() =>
                    work(async () =>
                      setPlan(
                        await browserRequest<PlanPreview>({
                          action: 'prepare',
                          tool: 'browser_undo_changes',
                          params: { batch_id: batch.batch_id },
                        }),
                      ),
                    )
                  }
                >
                  {t('agent.browser.panel.previewUndo', { defaultValue: 'Preview undo' })}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {notice && <p className="text-muted-foreground">{notice}</p>}

      {detail && (
        <details open>
          <summary>
            {t('agent.browser.panel.changeDetail', { defaultValue: 'Changed objects' })}
          </summary>
          <div className="max-h-48 space-y-2 overflow-auto">
            {detail.map((change, i) => (
              <div key={i} className="break-all rounded bg-muted/30 p-2">
                {/* Named by its title, not its id. A change row carries the title on
                    whichever side exists — a closed tab has no "after", a created one no
                    "before" — so the two are tried in turn. */}
                <strong>
                  {((change.after ?? change.before) as { title?: string } | undefined)?.title ||
                    t('agent.browser.preview.untitled', { defaultValue: 'Untitled' })}
                </strong>
                <p>
                  {t('agent.browser.panel.before', { defaultValue: 'Before' })}:{' '}
                  <BrowserState value={change.before} />
                </p>
                <p>
                  {/* Only the "after" side compares: "in another window" is a statement
                      about where it ended up, and saying it twice reads as two moves. */}
                  {t('agent.browser.panel.after', { defaultValue: 'After' })}:{' '}
                  <BrowserState value={change.after} other={change.before} />
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {plan && (
        <>
          <BrowserPlanPreview plan={plan} />
          {/*
            ⚠️ Undo is approved here, the same as any other write. The plan the background
            prepared is armed until one of these two buttons disposes of it, so neither branch
            may simply drop `plan` from state.
          */}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy || running}
              className="rounded bg-primary px-3 py-1 text-primary-foreground"
              onClick={() =>
                work(async () => {
                  const result = (await commitBrowserPlan(plan.id)) as {
                    status: string;
                    completed: number;
                    planned: number;
                    error?: string;
                  };
                  setNotice(
                    t('agent.browser.panel.outcome', {
                      status: statusLabel(result.status),
                      completed: result.completed,
                      planned: result.planned,
                      error: result.error ?? '',
                      defaultValue: '{{status}}: {{completed}}/{{planned}}. {{error}}',
                    }),
                  );
                  setPlan(null);
                  await load();
                })
              }
            >
              {t('agent.browser.panel.approveUndo', { defaultValue: 'Approve and undo' })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                cancelBrowserPlan(plan.id);
                setPlan(null);
              }}
            >
              {t('agent.browser.panel.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
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
