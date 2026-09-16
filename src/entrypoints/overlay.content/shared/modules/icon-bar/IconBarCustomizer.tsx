/**
 * Shared editor for the sidebar icon bar: one switch per icon, drag to reorder.
 *
 * Two entry points share this component so they cannot drift apart — the rail's
 * own right-click menu (via `openIconBarCustomizer`) and Settings → General.
 *
 * Reordering is confined to a block. The rail separates its blocks with blank
 * space, so a drag across that gap would be a drag across something the user
 * reads as a boundary; the arrows are bounded the same way. Locked icons can be
 * moved but not switched off.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Lock } from 'lucide-react';
import { Switch } from '@/shared/components/ui/switch';
import { Separator } from '../../components/ui/separator';
import { UIcon } from '@/shared/components/ui/icon';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { useIconBar } from './useIconBar';
import type { IconBarGroupId, IconBarItemDef } from './registry';

interface DragState {
  group: IconBarGroupId;
  id: string;
}

const ItemIcon = ({ item }: { item: IconBarItemDef }) => {
  if (item.iconify)
    return <UIcon icon={item.iconify} className="h-4 w-4 shrink-0" />;
  if (item.icon) return <item.icon className="h-4 w-4 shrink-0" />;
  return <span className="h-4 w-4 shrink-0" />;
};

export const IconBarCustomizer = () => {
  const { t } = useI18n();
  const { spec, groups, setIconVisible, move, resetIconBar } = useIconBar();
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Insertion point, as an index into the dragged item's block. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (!spec) return null;

  const endDrag = () => {
    setDrag(null);
    setDropIndex(null);
  };

  const commitDrop = (group: IconBarGroupId, ids: string[]) => {
    if (!drag || drag.group !== group || dropIndex === null) return endDrag();
    const from = ids.indexOf(drag.id);
    // The insertion point counts positions *between* rows, so anything dropped
    // below its own row is off by the row it vacates.
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    move(group, drag.id, to);
    endDrag();
  };

  const DropLine = ({ active }: { active: boolean }) => (
    <div
      className={cn(
        'h-0.5 -my-0.5 rounded-full transition-colors',
        active ? 'bg-primary' : 'bg-transparent',
      )}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">{t('iconBar.hint')}</p>
        <button
          onClick={resetIconBar}
          className="shrink-0 text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline"
        >
          {t('iconBar.reset')}
        </button>
      </div>

      {groups.map((group) => {
        const ids = group.items.map((item) => item.id);
        if (ids.length === 0) return null;
        const dragging = drag?.group === group.id;

        return (
          <div key={group.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(group.labelKey)}
              </span>
              <Separator className="flex-1" />
            </div>

            <div
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (!dragging) return;
                e.preventDefault();
                commitDrop(group.id, ids);
              }}
            >
              {group.items.map((item, index) => {
                const hidden = !group.visibleIds.includes(item.id);
                return (
                  <React.Fragment key={item.id}>
                    <DropLine active={dragging && dropIndex === index} />
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        // Firefox refuses to start a drag without payload.
                        e.dataTransfer.setData('text/plain', item.id);
                        setDrag({ group: group.id, id: item.id });
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => {
                        if (!dragging) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const below =
                          e.clientY - rect.top > rect.height / 2 ? 1 : 0;
                        setDropIndex(index + below);
                      }}
                      className={cn(
                        'group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/30',
                        drag?.id === item.id && 'opacity-40',
                      )}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />
                      <ItemIcon item={item} />
                      <span
                        className={cn(
                          'flex-1 min-w-0 truncate text-sm',
                          hidden && 'text-muted-foreground',
                        )}
                      >
                        {t(item.labelKey)}
                      </span>

                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          disabled={index === 0}
                          onClick={() => move(group.id, item.id, index - 1)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label={t('iconBar.moveUp')}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={index === ids.length - 1}
                          onClick={() => move(group.id, item.id, index + 1)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label={t('iconBar.moveDown')}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {item.locked ? (
                        <SimpleTooltip content={t('iconBar.locked')}>
                          <span className="flex h-5 w-9 items-center justify-center">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </span>
                        </SimpleTooltip>
                      ) : (
                        <Switch
                          checked={!hidden}
                          onCheckedChange={(checked) =>
                            setIconVisible(item.id, checked)
                          }
                        />
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <DropLine active={dragging && dropIndex === ids.length} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
