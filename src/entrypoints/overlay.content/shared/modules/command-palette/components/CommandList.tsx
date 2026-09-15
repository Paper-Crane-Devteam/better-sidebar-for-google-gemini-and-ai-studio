import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { groupOffsets as computeGroupOffsets } from '../lib/flatten';
import { CommandRow } from './CommandRow';
import type { CommandGroup, CommandItem } from '../types';

export interface CommandListProps {
  groups: CommandGroup[];
  /** Index into the flattened row list. */
  activeIndex: number;
  /** Total flattened rows — used to know when "nothing found" applies. */
  itemCount: number;
  onRun: (item: CommandItem) => void;
  onHover: (index: number) => void;
}

export const CommandList = ({
  groups,
  activeIndex,
  itemCount,
  onRun,
  onHover,
}: CommandListProps) => {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const offsets = useMemo(() => computeGroupOffsets(groups), [groups]);

  // Keep the cursor visible during keyboard walks. Queried from the DOM rather
  // than tracked with a ref: a ref would have to be attached and detached as the
  // active row moves, and React does not guarantee the detach and the attach
  // land in that order. Layout effect so the scroll happens in the same frame as
  // the highlight and the list never appears to lag a keypress.
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector('[data-active]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, itemCount]);

  return (
    <div
      ref={listRef}
      id="better-sidebar-command-list"
      role="listbox"
      className="flex-1 overflow-y-auto p-2"
    >
      {itemCount === 0 && groups.length === 0 ? (
        <div className="px-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t('commandPalette.empty')}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t('commandPalette.emptyHint')}
          </p>
        </div>
      ) : (
        groups.map((group, groupIndex) => (
          <div key={group.id} role="group" aria-label={group.label} className="mb-1 last:mb-0">
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>

            {group.items.map((item, itemIndex) => {
              const index = offsets[groupIndex] + itemIndex;
              return (
                <div key={item.id} id={`bs-cmd-${index}`}>
                  <CommandRow
                    item={item}
                    isActive={index === activeIndex}
                    onSelect={() => onRun(item)}
                    onHover={() => onHover(index)}
                  />
                </div>
              );
            })}

            {/* A group can be present with no rows only while its source is still
                loading — say so instead of leaving a bare header. */}
            {group.items.length === 0 && group.isLoading && (
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('commandPalette.searchingMessages')}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
