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
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { PagedTable, type PagedTableColumn } from '@/shared/components/ui/paged-table';
import { isTabTool } from '@/shared/browser-agent/contracts';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import i18n from '@/locale/i18n';
import { openBrowserBatchModal } from './BrowserBatchModal';
import { readJournal, type JournalEntry } from './journal';

const BrowserRecordsContent: React.FC = () => {
  const { t } = useI18n();
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState('');

  /**
   * Loaded on mount, and again after a restore lands — never on demand.
   *
   * There was a Reload button here, and nothing could arrive for it to find: the journal
   * only grows when a batch is applied, applying a batch needs a running session, and a
   * running session is exactly when this dialog is not the thing being looked at. The one
   * case where the list genuinely goes stale is a restore made from the detail dialog, and
   * that reloads through `onChanged` without being asked.
   */
  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await readJournal());
    } catch (e) {
      setRows([]);
      setError((e as Error).message);
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
      /*
        Fixed and narrow, with a short date.

        The table is `table-fixed`, so an unsized column absorbs whatever the sized ones
        leave — this one was that column, and a full `toLocaleString()` in it took a third
        of the dialog to say a thing nobody reads to the second. Short date plus short time
        is enough to tell two records apart, which is all this column is for; the exact
        timestamp is still spelled out in the detail dialog's title.
      */
      className: 'w-36',
      cell: (row) => (
        <span className="block truncate tabular-nums text-foreground">
          {new Date(row.created_at).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      ),
    },
    {
      /*
        Which half of the browser a batch touched — tabs and groups, or bookmarks.

        Derived from the tool name through `isTabTool`, the same call that decides what a
        snapshot captures, rather than a field added to the journal: the answer is already
        implied by the record and a second source for it could disagree with the first.
        Worth a column because "Done 6/6" says nothing about *what* moved, and the two
        kinds are restored independently — someone hunting for the batch that scattered
        their bookmarks should not have to open six tab batches to rule them out.
      */
      key: 'kind',
      header: t('agent.browser.panel.colKind', { defaultValue: 'Kind' }),
      className: 'w-24',
      cell: (row) => (
        <span className="block truncate text-muted-foreground">
          {isTabTool(row.tool)
            ? t('agent.browser.panel.kindTabs', { defaultValue: 'Tabs' })
            : t('agent.browser.panel.kindBookmarks', { defaultValue: 'Bookmarks' })}
        </span>
      ),
    },
    {
      // Unsized on purpose: the error line is the one cell here that can be any length, so
      // it gets the width the other three do not need.
      key: 'status',
      header: t('agent.browser.panel.colOutcome', { defaultValue: 'Outcome' }),
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
      // Headed, unlike most action columns. Every other column here is labelled, and the
      // one blank heading read as a label that had gone missing rather than one not needed.
      header: t('agent.browser.panel.colActions', { defaultValue: 'Actions' }),
      className: 'w-24 text-right',
      cell: (row) => (
        // A text button, not the outlined one it was: it opens a dialog about the row it
        // sits in, which is the same "go and look" the rest of this table implies, and a
        // framed button per row read as ten competing calls to action.
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => openBrowserBatchModal(row, () => void load())}
        >
          {t('agent.browser.panel.detail', { defaultValue: 'Detail' })}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* The one sentence this dialog keeps: it is the answer to "why is this list empty",
          and an empty list is the most common thing to arrive at. */}
      <p className="text-xs leading-relaxed">
        {t('agent.browser.panel.recordsIntro', {
          defaultValue:
            'Every batch the agent applied, kept on this machine. Open one to see the browser before and after it, and to put either back.',
        })}
      </p>

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
