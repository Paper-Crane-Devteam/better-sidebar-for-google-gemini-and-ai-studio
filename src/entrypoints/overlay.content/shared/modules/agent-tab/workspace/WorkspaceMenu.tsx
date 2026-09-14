/**
 * The workspace's three-dot menu, in the corner every other tab puts one.
 *
 * Holds the actions that are either rare or dangerous. Export is rare — you do it once,
 * when you want the files somewhere else. Clear and Delete are irreversible and operate on
 * everything at once, and a toolbar icon is a bad home for either: destructive actions sit
 * behind a deliberate gesture, and they read as what they are when spelled out in words
 * rather than compressed into a trash can that could plausibly mean "delete the selection".
 *
 * Opens on hover, matching `SidePanelMenu`. The awkward parts of that behaviour live in
 * `useHoverMenu`.
 */

import React from 'react';
import { FileArchive, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useI18n } from '@/shared/hooks/useI18n';
import { useHoverMenu } from '../../../components/menu/useHoverMenu';

export interface WorkspaceMenuProps {
  /** No files: export has nothing to write and clearing has nothing to remove. */
  isEmpty: boolean;
  /** The default workspace cannot be deleted, only cleared. */
  canDelete: boolean;
  onExportZip: () => void;
  onClear: () => void;
  onDelete: () => void;
}

export const WorkspaceMenu: React.FC<WorkspaceMenuProps> = ({
  isEmpty,
  canDelete,
  onExportZip,
  onClear,
  onDelete,
}) => {
  const { t } = useI18n();
  const menu = useHoverMenu();

  return (
    <DropdownMenu {...menu.rootProps}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // Same sizing and colour contract as the sibling header actions, so the trigger
          // follows the sidebar theme rather than inheriting the host page's text colour.
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
          aria-label={t('agent.workspace.moreActions', { defaultValue: 'More actions' })}
          {...menu.triggerProps}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={4} className="w-56 z-[9999]" {...menu.contentProps}>
        <DropdownMenuItem disabled={isEmpty} onClick={onExportZip}>
          <FileArchive className="mr-2 h-4 w-4" />
          <span>{t('agent.workspace.exportAll', { defaultValue: 'Export as ZIP' })}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isEmpty}
          className="text-destructive"
          onClick={onClear}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>{t('agent.workspace.clearAll', { defaultValue: 'Clear all files' })}</span>
        </DropdownMenuItem>

        {canDelete && (
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>
              {t('agent.workspace.delete', { defaultValue: 'Delete this workspace' })}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
