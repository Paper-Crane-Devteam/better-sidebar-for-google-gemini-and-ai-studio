/**
 * One row in the workspace tree.
 *
 * Built to look and behave like `SnippetNode`, because a person moving between the two
 * tabs should not have to learn a second set of gestures: click a folder to expand it,
 * click a file to read it, hover for the action bar, right-click for the same list, F2 to
 * rename, Delete to remove.
 *
 * The differences are all consequences of this tree describing a real filesystem rather
 * than SQL rows:
 *
 * - No pin, no favourite, no batch mode. There is nowhere to record any of them — OPFS
 *   stores bytes and names, and inventing a sidecar store to hold decoration would be a
 *   second source of truth about the same files.
 * - Files carry a binary/text distinction. The agent's tools read text, so a `.png` here
 *   is storage rather than material, and the row says so through its icon and tooltip
 *   instead of leaving it to be discovered from a garbled tool result.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { formatBytes } from '@/shared/workspace/file-kinds';
import {
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';
import { FolderTreeNodeContent } from '../../../../components/folder-tree';
import type {
  FolderTreeNodeData,
  NodeRendererProps,
} from '../../../../components/folder-tree/types';
import {
  NodeActionBar,
  renderMenuItems,
  type ActionButtonDef,
} from '../../../../components/node-action-bar';
import type { WorkspaceNodeData } from '../useWorkspaceFiles';
import { useWorkspaceMenuItems, type WorkspaceMenuHandlers } from './useWorkspaceMenuItems';

interface WorkspaceNodeProps extends NodeRendererProps<FolderTreeNodeData> {
  handlers: WorkspaceMenuHandlers;
  searchQuery?: string;
}

export const WorkspaceNode: React.FC<WorkspaceNodeProps> = ({
  node,
  style,
  dragHandle,
  handlers,
  searchQuery,
}) => {
  const { t } = useI18n();
  const entry = node.data.data as WorkspaceNodeData;
  const isFile = node.data.type === 'file';

  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Renaming a folder changes the id of everything beneath it, so the tree remounts with
  // fresh nodes. Re-syncing on the name keeps a stale draft out of the next edit.
  useEffect(() => {
    setNewName(node.data.name);
  }, [node.data.name, node.isEditing]);

  const menuItems = useWorkspaceMenuItems(node, handlers);
  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const nodeRowRef = useRef<HTMLDivElement>(null);

  // Drag is suppressed while renaming so the text inside the input can be selected by
  // dragging, which is otherwise swallowed by the row's drag handle.
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      nodeRowRef.current = el;
      if (dragHandle) dragHandle(node.isEditing ? null : el);
    },
    [dragHandle, node.isEditing],
  );

  const toggleIcon = isFile ? null : node.isOpen ? (
    <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
  ) : (
    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
  );

  /**
   * A plain sheet for binary, a lined one for text.
   *
   * Guessed from the extension rather than measured, which is occasionally wrong and
   * costs nothing when it is — the icon is a hint, and the operations it hints at
   * (`Copy content`) are the ones that would have failed anyway.
   */
  const fileIcon = isFile
    ? entry.isBinary
      ? <FileIcon className="w-3.5 h-3.5" />
      : <FileText className="w-3.5 h-3.5" />
    : null;

  /** Path, size and — for binary — why the agent will not read it. */
  const tooltipContent = (isOverflowing: boolean) => (
    <div className="max-w-[280px]">
      {isOverflowing && <div className="font-medium mb-1">{node.data.name}</div>}
      <div className="text-xs opacity-75 break-all">{entry.path}</div>
      {isFile && entry.size !== undefined && (
        <div className="text-xs opacity-75 mt-0.5">{formatBytes(entry.size)}</div>
      )}
      {isFile && entry.isBinary && (
        <div className="text-xs opacity-90 mt-1">
          {t('agent.workspace.binaryHint', {
            defaultValue:
              'Binary file. Stored and downloadable, but the agent cannot read it.',
          })}
        </div>
      )}
    </div>
  );

  // Download is the one action worth a dedicated button: it is the only way anything
  // leaves OPFS, and burying the sole exit in a menu makes the workspace feel one-way.
  const quickActions: ActionButtonDef[] = isFile
    ? [
        {
          icon: <Download className="h-3.5 w-3.5" />,
          tooltip: t('common.download', { defaultValue: 'Download' }),
          onClick: (e) => {
            e.stopPropagation();
            e.preventDefault();
            handlers.onDownload(entry.path);
          },
        },
      ]
    : [];

  const row = (
    <div
      style={style}
      className="outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]"
      // Kept from reaching the container's own context menu, which would otherwise
      // close this row's menu as it opens.
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        ref={combinedRef}
        role="button"
        tabIndex={0}
        className={cn(
          'flex items-center gap-1.5 px-1 cursor-pointer group relative pr-2 h-full',
          'no-underline outline-none text-density font-medium text-foreground/80',
          !node.isSelected && 'hover:bg-accent/50',
          node.isSelected && 'node-item-selected',
          node.willReceiveDrop && 'bg-accent/50 border border-primary/40',
          isMenuActive && 'bg-accent/50 node-menu-active',
        )}
        onClick={() => {
          if (isFile) {
            node.select();
            handlers.onOpen(entry.path);
            return;
          }
          node.select();
          node.toggle();
        }}
        onKeyDown={(e) => {
          if (node.isEditing) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (isFile) handlers.onOpen(entry.path);
          else node.toggle();
        }}
      >
        <FolderTreeNodeContent
          node={node}
          folderIcon={<FolderIcon className="w-4 h-4 text-foreground/80" />}
          fileIcon={fileIcon}
          toggleIcon={toggleIcon}
          handleToggle={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
          newName={newName}
          setNewName={setNewName}
          searchQuery={searchQuery}
          hoverRef={nodeRowRef}
          tooltipContent={tooltipContent}
          forceShowTooltip
        />

        {!node.isEditing && (
          <NodeActionBar
            actions={quickActions}
            menuItems={menuItems}
            forceVisible={isMenuActive}
            onDropdownOpenChange={setIsDropdownOpen}
          />
        )}
      </div>
    </div>
  );

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {renderMenuItems(menuItems, 'context')}
      </ContextMenuContent>
    </ExclusiveContextMenu>
  );
};
