/**
 * The workspace header.
 *
 * Two rows, following `SnippetsHeader`: identity and view controls above, search and
 * everything that adds content below. Destructive and rare actions are not here at all —
 * they live in the three-dot menu, where the rest of the sidebar keeps them.
 *
 * ## One button for four ways to get a file
 *
 * New file, new folder, import files, import folder — all behind a single `+`. The split
 * between *new* and *import* is real and worth naming (one starts empty, one comes from
 * disk), but it is not worth four buttons in a sidebar this narrow.
 *
 * Files and folders need separate entries whether we like it or not: an `<input>` is either
 * `webkitdirectory` or it is not, and the File System Access API likewise has one method for
 * each. There is no native dialog that offers both, so the choice has to be made before the
 * dialog opens. Drag-and-drop has no such limitation and accepts either.
 *
 * ## What is deliberately absent
 *
 * - **Refresh.** Every mutation already re-lists, and the agent's writes arrive through the
 *   same path. A button whose only job is to fetch what you are already looking at invites
 *   the reading that the view might be stale.
 * - **File and byte counts.** Nothing is decided by them. They filled a line with numbers
 *   that changed on their own and never prompted an action.
 */

import React from 'react';
import {
  ArrowLeft,
  FilePlus,
  FolderPlus,
  FolderUp,
  ListCollapse,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useI18n } from '@/shared/hooks/useI18n';
import { WorkspaceMenu } from './WorkspaceMenu';

export interface WorkspaceToolbarProps {
  /** No files: gates export and clear in the three-dot menu. */
  isEmpty: boolean;
  /** False for the default workspace, which can be cleared but not removed. */
  canDelete: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  /** Non-null while a transfer runs; shown as a status line under the rows. */
  progress: string | null;
  /** Omitted when the workspace is the tab's own destination — see `WorkspaceView`. */
  onBack?: () => void;
  onCollapseAll: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onExportZip: () => void;
  onClear: () => void;
  onDelete: () => void;
}

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  isEmpty,
  canDelete,
  searchTerm,
  onSearchChange,
  progress,
  onBack,
  onCollapseAll,
  onNewFolder,
  onNewFile,
  onImportFiles,
  onImportFolder,
  onExportZip,
  onClear,
  onDelete,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col border-b border-border/60">
      {/* Row 1: back, title, view controls, overflow menu */}
      <div className="flex items-center gap-1 px-2 pt-2">
        {/* Only when there is somewhere to go back to. As the Workspace agent's own panel
            there is not: the agent switcher above is the way out, and an arrow pointing at
            the other agent is not "back" in any sense the user means. */}
        {onBack && (
          <SimpleTooltip content={t('common.back', { defaultValue: 'Back' })}>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
        )}

        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
          {t('agent.workspace.title', { defaultValue: 'Workspace' })}
        </h1>

        <SimpleTooltip content={t('menu.collapseAll', { defaultValue: 'Collapse all' })}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onCollapseAll}
          >
            <ListCollapse className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <WorkspaceMenu
          isEmpty={isEmpty}
          canDelete={canDelete}
          onExportZip={onExportZip}
          onClear={onClear}
          onDelete={onDelete}
        />
      </div>

      {/* Row 2: search, then everything that adds a file */}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('agent.workspace.searchPlaceholder', {
              defaultValue: 'Search files',
            })}
            className="h-7 pl-7 pr-7 text-xs"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label={t('common.clear', { defaultValue: 'Clear' })}
              className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/*
          No tooltip on the trigger: `SimpleTooltip` and `DropdownMenuTrigger` both use
          `asChild`, and nesting them leaves two wrappers competing for the Button's ref.
          The menu items name themselves.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t('agent.workspace.add', { defaultValue: 'Add' })}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onNewFile}>
              <FilePlus className="mr-2 h-4 w-4" />
              {t('agent.workspace.newFile', { defaultValue: 'New file' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewFolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              {t('agent.workspace.newFolder', { defaultValue: 'New folder' })}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* "Import", not "Upload": nothing leaves the browser — the bytes are copied
                into OPFS, which is local storage that happens to look like a filesystem. */}
            <DropdownMenuItem onClick={onImportFiles}>
              <Upload className="mr-2 h-4 w-4" />
              {t('agent.workspace.importFiles', { defaultValue: 'Import files…' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportFolder}>
              <FolderUp className="mr-2 h-4 w-4" />
              {t('agent.workspace.importFolder', { defaultValue: 'Import folder…' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress, only while a transfer is running */}
      {progress && (
        <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {progress}
        </div>
      )}
    </div>
  );
};
