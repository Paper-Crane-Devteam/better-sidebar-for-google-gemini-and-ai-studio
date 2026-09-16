/**
 * Right-click menu for the sidebar icon bar, in the shape editors use for their
 * own toolbars: every icon the rail can hold, checked when it is showing, click
 * to toggle. The three locked icons appear checked and disabled rather than being
 * omitted, so the menu reads as the full inventory instead of a filtered list.
 *
 * Ordering needs a drag surface, which a menu is not, so it lives one click away
 * in a modal — the same editor Settings embeds.
 */

import React from 'react';
import { ArrowDownUp, RotateCcw } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { modal } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';
import i18n from '@/locale/i18n';
import { useIconBar } from './useIconBar';
import { IconBarCustomizer } from './IconBarCustomizer';

/** Open the drag-to-reorder editor. Also reachable from Settings → General. */
export function openIconBarCustomizer() {
  modal.info({
    title: i18n.t('shortcuts.title'),
    content: <IconBarCustomizer />,
    confirmText: i18n.t('common.close'),
    modalClassName: 'max-w-md',
  });
}

interface IconBarContextMenuProps {
  /** The rail. Rendered as-is — the trigger adds no wrapper element. */
  children: React.ReactNode;
}

export const IconBarContextMenu = ({ children }: IconBarContextMenuProps) => {
  const { t } = useI18n();
  const { spec, groups, setIconVisible, resetIconBar } = useIconBar();

  if (!spec) return <>{children}</>;

  const populated = groups.filter((group) => group.items.length > 0);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[13rem]">
        {populated.map((group, index) => (
          <React.Fragment key={group.id}>
            {index > 0 && <ContextMenuSeparator />}
            {group.items.map((item) => (
              <ContextMenuCheckboxItem
                key={item.id}
                checked={group.visibleIds.includes(item.id)}
                disabled={item.locked}
                // Radix closes the menu on select; toggling several icons in a
                // row is the common case, so keep it open.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => setIconVisible(item.id, checked)}
              >
                {t(item.labelKey)}
              </ContextMenuCheckboxItem>
            ))}
          </React.Fragment>
        ))}

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => openIconBarCustomizer()}>
          <ArrowDownUp className="mr-2 h-4 w-4" />
          {t('iconBar.reorder')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => resetIconBar()}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('iconBar.reset')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
