/**
 * "Chat message status" — the answer to "why can't I find this chat when I search?".
 *
 * Search reads message text, and messages only reach the database when the chat is
 * opened, so anything from before the extension was installed is a title with
 * nothing behind it. This lists every chat with what we hold for it, missing ones
 * first, and lets the user fetch them — one at a time, or the whole backlog.
 *
 * It shares its fetch-and-store step with the idle backfill scheduler
 * (`shared/lib/backfill/sync.ts`); the difference is only in the pacing and in who
 * asked.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal, useModalStore } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils/utils';
import {
  BACKFILL_MANUAL_GAP_MS,
  BACKFILL_MANUAL_ACTIVITY_EVENT,
} from '@/shared/constants/backfill';
import { syncConversationMessages } from '@/shared/lib/backfill/sync';
import { detectPlatform } from '@/shared/types/platform';
import i18n from '@/locale/i18n';

interface StatusRow {
  id: string;
  title: string | null;
  message_count: number;
}

type RowState = 'idle' | 'syncing' | 'synced' | 'empty' | 'failed';

/**
 * Rows per page.
 *
 * Paged rather than a growing "show more" list, because the list is as long as the
 * user's history: a few thousand chats would put a few thousand rows in the DOM and
 * make the dialog scroll badly, and a "show more" button gets there just as surely,
 * only slower. A page is a fixed ceiling.
 */
const PAGE_SIZE = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tell the idle scheduler to stand down.
 *
 * Fired before every manual request rather than as a start/end pair: the scheduler
 * treats it as "busy for the next minute", so a dialog that is closed mid-batch, or
 * a batch that dies on an exception, needs no cleanup. The two live in separate
 * content scripts and share no module state, hence a DOM event.
 */
function announceManualActivity() {
  window.dispatchEvent(new CustomEvent(BACKFILL_MANUAL_ACTIVITY_EVENT));
}

const MessageSyncModalContent = () => {
  const { t } = useI18n();
  const platform = detectPlatform();

  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [page, setPage] = useState(0);
  const [batch, setBatch] = useState<{ done: number; total: number; failed: number } | null>(
    null,
  );

  // Read by the batch loop, which must see a cancel that happens mid-await.
  const cancelled = useRef(false);
  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const load = useCallback(async () => {
    const response = await browser.runtime.sendMessage({
      type: 'GET_MESSAGE_SYNC_STATUS',
      payload: { platform },
    });
    if (response?.success) {
      setRows(response.data ?? []);
    } else {
      setRows([]);
      toast.error(response?.error || t('backfillStatus.loadFailed'));
    }
  }, [platform, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Apply one sync result to the row, so the table reflects reality without a reload. */
  const applyResult = (id: string, stored: number, state: RowState) => {
    setRowStates((prev) => ({ ...prev, [id]: state }));
    if (stored > 0) {
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, message_count: stored } : r)) : prev,
      );
    }
  };

  const syncOne = async (id: string): Promise<'synced' | 'empty' | 'failed'> => {
    setRowStates((prev) => ({ ...prev, [id]: 'syncing' }));
    announceManualActivity();

    const result = await syncConversationMessages(platform, id);
    if (!result.ok) {
      applyResult(id, 0, 'failed');
      return 'failed';
    }
    if (result.stored === 0) {
      applyResult(id, 0, 'empty');
      return 'empty';
    }
    applyResult(id, result.stored, 'synced');
    return 'synced';
  };

  const runBatch = async () => {
    const confirmed = await modal.confirm({
      title: t('backfillStatus.batchWarnTitle'),
      content: (
        <div className="flex items-start gap-2 text-sm leading-relaxed">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
          <span>{t('backfillStatus.batchWarnBody')}</span>
        </div>
      ),
      confirmText: t('backfillStatus.batchWarnConfirm'),
    });
    if (!confirmed) return;

    // Re-read first: the idle scheduler may have filled some of these in while the
    // dialog was open, and there is no reason to ask for them twice.
    const response = await browser.runtime.sendMessage({
      type: 'GET_MESSAGE_SYNC_STATUS',
      payload: { platform },
    });
    const fresh: StatusRow[] = response?.success ? (response.data ?? []) : (rows ?? []);
    setRows(fresh);

    const pending = fresh.filter((r) => r.message_count === 0);
    if (pending.length === 0) {
      toast.info(t('backfillStatus.nothingToSync'));
      return;
    }

    cancelled.current = false;
    setBatch({ done: 0, total: pending.length, failed: 0 });

    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      if (cancelled.current) break;
      if (i > 0) await sleep(BACKFILL_MANUAL_GAP_MS);
      if (cancelled.current) break;

      const outcome = await syncOne(pending[i].id);
      if (outcome === 'failed') failed += 1;
      setBatch({ done: i + 1, total: pending.length, failed });
    }

    setBatch(null);
    if (failed > 0) {
      toast.warning(
        t('backfillStatus.batchDoneWithFailures', {
          count: pending.length - failed,
          failed,
        }),
      );
    } else if (!cancelled.current) {
      toast.success(t('backfillStatus.batchDone', { count: pending.length }));
    }
  };

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  const missing = rows.filter((r) => r.message_count === 0).length;
  const batching = batch !== null;

  // Clamped rather than trusted: the batch re-read can shorten the list under a page
  // number that was valid a moment ago.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const from = current * PAGE_SIZE;
  const shown = rows.slice(from, from + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed">{t('backfillStatus.intro')}</p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground min-w-0">
          {missing > 0
            ? t('backfillStatus.missingCount', { count: missing, total: rows.length })
            : t('backfillStatus.allSynced', { count: rows.length })}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {batching ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t('backfillStatus.progress', {
                  done: batch.done,
                  total: batch.total,
                })}
                {batch.failed > 0 &&
                  ` · ${t('backfillStatus.progressFailed', { count: batch.failed })}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                <X className="h-3 w-3" />
                {t('backfillStatus.stop')}
              </Button>
            </>
          ) : (
            missing > 0 && (
              <Button variant="outline" size="sm" onClick={() => void runBatch()}>
                {t('backfillStatus.syncAll', { count: missing })}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="rounded-md border border-border/60 overflow-hidden">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="bg-secondary/40 text-foreground">
              <th className="text-left font-medium px-3 py-2">
                {t('backfillStatus.colChat')}
              </th>
              <th className="text-right font-medium px-3 py-2 w-24">
                {t('backfillStatus.colMessages')}
              </th>
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <MessageSyncRow
                key={row.id}
                row={row}
                state={rowStates[row.id] ?? 'idle'}
                disabled={batching}
                onSync={() => void syncOne(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t('backfillStatus.pageRange', {
              from: from + 1,
              to: from + shown.length,
              total: rows.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label={t('backfillStatus.prevPage')}
            >
              <ChevronLeft className="h-3 w-3" />
              {t('backfillStatus.prevPage')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              aria-label={t('backfillStatus.nextPage')}
            >
              {t('backfillStatus.nextPage')}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const MessageSyncRow = ({
  row,
  state,
  disabled,
  onSync,
}: {
  row: StatusRow;
  state: RowState;
  disabled: boolean;
  onSync: () => void;
}) => {
  const { t } = useI18n();
  const hasMessages = row.message_count > 0;

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 min-w-0">
        <OverflowTooltip className="block truncate text-foreground">
          {row.title || t('common.untitled')}
        </OverflowTooltip>
      </td>
      <td
        className={cn(
          'px-3 py-2 text-right tabular-nums',
          hasMessages ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {hasMessages ? row.message_count : t('backfillStatus.none')}
      </td>
      <td className="px-3 py-2 text-right">
        {state === 'syncing' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin inline-block text-muted-foreground" />
        ) : state === 'empty' ? (
          <span className="text-[11px] text-muted-foreground">
            {t('backfillStatus.reallyEmpty')}
          </span>
        ) : state === 'failed' ? (
          <button
            onClick={onSync}
            disabled={disabled}
            className="text-[11px] text-destructive hover:underline disabled:opacity-50"
          >
            {t('backfillStatus.retry')}
          </button>
        ) : hasMessages ? (
          // A freshly synced row is the only one that earns a tick. The rest were
          // already filled in before the dialog opened, and marking those would
          // suggest this dialog did something it did not.
          state === 'synced' ? (
            <Check className="h-3.5 w-3.5 inline-block text-success" />
          ) : null
        ) : (
          <button
            onClick={onSync}
            disabled={disabled}
            className="text-[11px] text-primary hover:underline disabled:opacity-50"
          >
            {t('backfillStatus.sync')}
          </button>
        )}
      </td>
    </tr>
  );
};

/**
 * Open the dialog.
 *
 * Keyed by id so the two entry points — the settings link and the empty search
 * result — cannot stack two copies of it.
 */
export function openMessageSyncModal() {
  useModalStore.getState().open({
    id: 'message-sync-status',
    type: 'info',
    title: i18n.t('backfillStatus.title'),
    content: <MessageSyncModalContent />,
    confirmText: i18n.t('common.close'),
    modalClassName: 'max-w-3xl',
  });
}
