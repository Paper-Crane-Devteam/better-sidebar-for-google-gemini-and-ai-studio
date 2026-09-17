/**
 * "Local records" — what the Browser agent has already done to this browser.
 *
 * ⚠️ **This is not a nice-to-have log.** Tabs and bookmarks are not versioned and not
 * diffable: once a batch lands, the record the extension kept is the only evidence it
 * happened and the only route back. It has to be reachable with no session running, because
 * the session that made the change is usually long over by the time someone notices they want
 * it back.
 *
 * It was a list rendered under the Agent tab's panel. Two things were wrong with that: it
 * pushed everything below it off a sidebar-width column and it grew without bound, so the
 * fiftieth record was a scroll away from the first. A dialog with `PagedTable` fixes both, and
 * ten rows a page is the same ceiling the chat sync dialog settled on.
 *
 * Opening a record stacks {@link openBrowserBatchModal} on top of this, which stays mounted
 * underneath and reloads if that dialog restored something — a restore is itself a new batch,
 * so the list is out of date the moment one lands.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { PagedTable, type PagedTableColumn } from '@/shared/components/ui/paged-table';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import i18n from '@/locale/i18n';
import { openBrowserBatchModal } from './BrowserBatchModal';
import { readJournal, type JournalEntry } from './journal';

const BrowserRecordsContent: React.FC = () => {
  const { t } = useI18n();
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setRows(await readJournal());
    } catch (e) {
      setRows([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  const columns: PagedTableColumn<JournalEntry>[] = [
    {
      key: 'when',
      header: t('agent.browser.panel.colWhen', { defaultValue: 'When' }),
      cell: (row) => (
        <span className="text-foreground">{new Date(row.created_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'status',
      header: t('agent.browser.panel.colOutcome', { defaultValue: 'Outcome' }),
      className: 'w-36',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate">
            {t(`agent.browser.status.${row.status}`, { defaultValue: row.status })}
            {' · '}
            <span className="tabular-nums">
              {row.completed}/{row.planned}
            </span>
          </span>
          {row.error && <span className="block truncate text-destructive">{row.error}</span>}
        </div>
      ),
    },
    {
      key: 'detail',
      className: 'w-32 text-right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openBrowserBatchModal(row, () => void load())}
        >
          {t('agent.browser.panel.detail', { defaultValue: 'Before and after' })}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {/* The one sentence this dialog keeps: it is the answer to "why is this list empty",
            and an empty list is the most common thing to arrive at. */}
        <p className="min-w-0 text-xs leading-relaxed">
          {t('agent.browser.panel.recordsIntro', {
            defaultValue:
              'Every batch the agent applied, kept on this machine. Open one to see the browser before and after it, and to put either back.',
          })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void load()}
          aria-label={t('agent.browser.panel.reload', { defaultValue: 'Reload' })}
        >
          <RefreshCw className={busy ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          {t('agent.browser.panel.reload', { defaultValue: 'Reload' })}
        </Button>
      </div>

      <PagedTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.batch_id}
        empty={t('agent.browser.panel.noHistory', {
          defaultValue: 'No records to show. Reading history needs the matching permission too.',
        })}
      />

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};

/** Open the record list. Keyed, so the button cannot stack two copies of it. */
export function openBrowserRecordsModal() {
  useModalStore.getState().open({
    id: 'browser-agent-records',
    type: 'info',
    title: i18n.t('agent.browser.panel.recordsTitle', { defaultValue: 'Local records' }),
    content: <BrowserRecordsContent />,
    confirmText: i18n.t('common.close'),
    modalClassName: 'max-w-3xl',
  });
}
