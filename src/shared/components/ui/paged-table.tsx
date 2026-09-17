/**
 * A table that pages itself.
 *
 * Extracted from the chat message-sync dialog, which is where the shape was worked out: a
 * list as long as the user's history, in a dialog, where "show more" and "render everything"
 * both end up putting a few thousand rows in the DOM. A page is a fixed ceiling, and every
 * list that arrives in a dialog from now on wants the same one.
 *
 * ## What is shared, and what deliberately is not
 *
 * Only the table and its pager. The dialog around it is *not* part of this, and that was a
 * real decision: the two callers that exist put quite different things above the table — one
 * an intro plus a batch-sync control, the other a heading and a reload — and both need their
 * own modal id, title and footer. A `openTableModal()` helper would have to take all of that
 * as options, which is the same code with an extra layer to read through. So callers keep
 * `useModalStore.open()` and drop this into `content`.
 *
 * ## Page state lives here
 *
 * Including the clamp. Rows can get shorter under a page number that was valid a moment ago
 * — a reload that finds fewer records, a filter — and every caller getting that right
 * independently is exactly the kind of thing that only gets got right once.
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';

/** Rows per page, unless a caller says otherwise. */
export const PAGED_TABLE_PAGE_SIZE = 10;

export interface PagedTableColumn<T> {
  /** React key for the column, and nothing else. Never displayed. */
  key: string;
  /** Omit for an action column that needs no label. */
  header?: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /**
   * Width and alignment, applied to the header cell and every body cell in the column, so a
   * column cannot drift out of line with its own heading.
   */
  className?: string;
}

interface PagedTableProps<T> {
  rows: T[];
  columns: PagedTableColumn<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Shown in place of the table when there is nothing at all. */
  empty?: React.ReactNode;
  className?: string;
}

export function PagedTable<T>({
  rows,
  columns,
  rowKey,
  pageSize = PAGED_TABLE_PAGE_SIZE,
  empty,
  className,
}: PagedTableProps<T>) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);

  if (rows.length === 0 && empty !== undefined) {
    return <div className={cn('text-xs text-muted-foreground', className)}>{empty}</div>;
  }

  // Clamped rather than trusted: see the note at the top of the file.
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const from = current * pageSize;
  const shown = rows.slice(from, from + pageSize);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="bg-secondary/40 text-foreground">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('px-3 py-2 text-left font-medium', column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className="border-t border-border/40">
                {columns.map((column) => (
                  <td key={column.key} className={cn('min-w-0 px-3 py-2', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* No pager for a single page — it would be two dead buttons and a range that
          restates the row count. */}
      {rows.length > pageSize && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t('common.pageRange', {
              from: from + 1,
              to: from + shown.length,
              total: rows.length,
              defaultValue: '{{from}} - {{to}} of {{total}}',
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label={t('common.prevPage', { defaultValue: 'Previous' })}
            >
              <ChevronLeft className="h-3 w-3" />
              {t('common.prevPage', { defaultValue: 'Previous' })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              aria-label={t('common.nextPage', { defaultValue: 'Next' })}
            >
              {t('common.nextPage', { defaultValue: 'Next' })}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
