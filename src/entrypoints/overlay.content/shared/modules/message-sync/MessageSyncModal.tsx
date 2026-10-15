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
 *
 * The table and its pager are `PagedTable` — this dialog is where that shape was worked
 * out, and the Browser agent's record list needs the same one.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import { PagedTable, type PagedTableColumn } from '@/shared/components/ui/paged-table';
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

/** `missing` — the platform says the chat does not exist; a retry would only fail again. */
type RowState = 'idle' | 'syncing' | 'synced' | 'empty' | 'missing' | 'failed';

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

  const syncOne = async (id: string): Promise<'synced' | 'empty' | 'missing' | 'failed'> => {
    setRowStates((prev) => ({ ...prev, [id]: 'syncing' }));
    announceManualActivity();

    const result = await syncConversationMessages(platform, id);
    if (!result.ok && result.reason === 'not-found') {
      applyResult(id, 0, 'missing');
      return 'missing';
    }
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

  const columns: PagedTableColumn<StatusRow>[] = [
    {
      key: 'chat',
      header: t('backfillStatus.colChat'),
      cell: (row) => (
        <OverflowTooltip className="block truncate text-foreground">
          {row.title || t('common.untitled')}
        </OverflowTooltip>
      ),
    },
    {
      key: 'messages',
      header: t('backfillStatus.colMessages'),
      className: 'w-24 text-right',
      cell: (row) => (
        <span
          className={cn(
            'tabular-nums',
            row.message_count > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {row.message_count > 0 ? row.message_count : t('backfillStatus.none')}
        </span>
      ),
    },
    {
      key: 'action',
      className: 'w-24 text-right',
      cell: (row) => (
        <MessageSyncAction
          row={row}
          state={rowStates[row.id] ?? 'idle'}
          disabled={batching}
          onSync={() => void syncOne(row.id)}
        />
      ),
    },
  ];

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

      <PagedTable rows={rows} columns={columns} rowKey={(row) => row.id} />
    </div>
  );
};

/** The row's one control: sync it, retry it, or say why there is nothing to do. */
const MessageSyncAction = ({
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

  if (state === 'syncing') {
    return <Loader2 className="inline-block h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
  if (state === 'empty') {
    return (
      <span className="text-[11px] text-muted-foreground">{t('backfillStatus.reallyEmpty')}</span>
    );
  }
  if (state === 'missing') {
    return (
      <span
        className="text-[11px] text-muted-foreground cursor-help"
        title={t('backfillStatus.notFoundHint')}
      >
        {t('backfillStatus.notFound')}
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <button
        onClick={onSync}
        disabled={disabled}
        className="text-[11px] text-destructive hover:underline disabled:opacity-50"
      >
        {t('backfillStatus.retry')}
      </button>
    );
  }
  if (hasMessages) {
    // A freshly synced row is the only one that earns a tick. The rest were already
    // filled in before the dialog opened, and marking those would suggest this dialog
    // did something it did not.
    return state === 'synced' ? (
      <Check className="inline-block h-3.5 w-3.5 text-success" />
    ) : null;
  }
  return (
    <button
      onClick={onSync}
      disabled={disabled}
      className="text-[11px] text-primary hover:underline disabled:opacity-50"
    >
      {t('backfillStatus.sync')}
    </button>
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
