/**
 * The workspace tree, and every filesystem operation it can start.
 *
 * The shared `FolderTree` rather than a bespoke list: the tab already asks people to
 * learn a tree in Library, Prompts and Snippets, and this one is a tree too. Reusing it
 * brings drag-to-move, inline rename, multi-select, keyboard delete and persisted expand
 * state at no cost, and keeps row height, indentation and typography identical to the
 * rest of the sidebar.
 *
 * ## Every operation is a path operation
 *
 * `FolderTree` speaks in ids, and here an id *is* the path (see `useWorkspaceFiles`).
 * A rename is a move to a sibling path; a drag is a move to a different parent. So the
 * three callbacks it needs collapse into one filesystem call, plus a reload.
 *
 * Reloading the whole listing after each mutation rather than patching the tree in place
 * is deliberate. The agent writes to this same filesystem while the panel is open, so
 * local state is only ever a guess — a re-list is both simpler and more truthful, and at
 * one recursive call for a workspace of notes it is not worth optimising away.
 */

import React, { useCallback, useRef } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { modal } from '@/shared/lib/modal';
import { forWorkspace } from '@/shared/workspace/client';
import { basenameOf } from '@/shared/workspace/file-kinds';
import { FolderTree } from '../../../components/folder-tree';
import type {
  FolderTreeHandle,
  FolderTreeNodeData,
} from '../../../components/folder-tree/types';
import { WorkspaceNode } from './node';
import type { WorkspaceMenuHandlers } from './node/useWorkspaceMenuItems';
import { downloadFile } from './workspace-io';

/** The parent path of a workspace path. '' for a top-level entry. */
function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function join(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export interface WorkspaceFileTreeProps {
  workspaceId: string;
  data: FolderTreeNodeData[];
  /** Directories as `{ id, parent_id }`, for `useFolderTree`'s drag type check. */
  folders: Array<{ id: string; parent_id: string | null }>;
  searchTerm: string;
  reload: () => Promise<void>;
  onOpenFile: (path: string) => void;
  /** Start a file upload targeting a directory. */
  onUploadTo: (dirPath: string) => void;
  /** Export a subtree as a ZIP. */
  onDownloadZip: (dirPath: string) => void;
  /**
   * Creation, owned by the view.
   *
   * Passed in rather than implemented here so the header's buttons keep working when the
   * workspace is empty and this component is not mounted at all. See `useWorkspaceCreate`.
   */
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
}

/**
 * What the view can ask of the tree.
 *
 * `open` and `edit` are here for `useWorkspaceCreate`, which has to reveal and rename a
 * new entry it created without knowing anything else about the tree.
 */
export interface WorkspaceFileTreeHandle {
  collapseAll: () => void;
  open: (id: string) => void;
  edit: (id: string) => void;
}

export const WorkspaceFileTree = React.forwardRef<
  WorkspaceFileTreeHandle,
  WorkspaceFileTreeProps
>(
  (
    {
      workspaceId,
      data,
      folders,
      searchTerm,
      reload,
      onOpenFile,
      onUploadTo,
      onDownloadZip,
      onCreateFolder,
      onCreateFile,
    },
    ref,
  ) => {
    const { t } = useI18n();
    const treeRef = useRef<FolderTreeHandle>(null);
    // Memoised because it is a dependency of nearly every callback below; a fresh client
    // each render would rebuild all of them and defeat the memoisation entirely.
    const ws = React.useMemo(() => forWorkspace(workspaceId), [workspaceId]);

    // Forwarded straight through to `FolderTree`'s own handle. The view needs `open` and
    // `edit` to reveal an entry it just created; nothing here interprets them.
    React.useImperativeHandle(ref, () => ({
      collapseAll: () => treeRef.current?.collapseAll(),
      open: (id: string) => treeRef.current?.open(id),
      edit: (id: string) => treeRef.current?.edit(id),
    }));

    // ─── FolderTree callbacks ─────────────────────────────────────────────

    const handleMoveItem = useCallback(
      async (id: string, parentId: string | null) => {
        const target = parentId ?? '';
        // Dropping a row back where it started is a normal gesture, and the filesystem
        // would refuse it as an existing destination. Absorb it here.
        if (parentOf(id) === target) return;

        try {
          await ws.move(id, join(target, basenameOf(id)));
          await reload();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      [reload, ws],
    );

    const handleRenameItem = useCallback(
      async (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === basenameOf(id)) return;

        // A slash would silently relocate the entry rather than rename it, which is not
        // what typing into a name field means.
        if (trimmed.includes('/')) {
          toast.error(
            t('agent.workspace.nameNoSlash', {
              defaultValue: 'A name cannot contain "/".',
            }),
          );
          return;
        }

        try {
          await ws.move(id, join(parentOf(id), trimmed));
          await reload();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      [reload, t, ws],
    );

    const handleDeleteItems = useCallback(
      async (ids: string[]) => {
        if (ids.length === 0) return;

        const confirmed = await modal.confirm({
          title: t('common.delete', { defaultValue: 'Delete' }),
          content:
            ids.length === 1
              ? t('agent.workspace.confirmDeleteOne', {
                  defaultValue: `Delete "${basenameOf(ids[0])}"? A folder takes its contents with it. This cannot be undone.`,
                  name: basenameOf(ids[0]),
                })
              : t('agent.workspace.confirmDeleteMany', {
                  defaultValue: `Delete ${ids.length} items? Folders take their contents with them. This cannot be undone.`,
                  count: ids.length,
                }),
          confirmText: t('common.delete', { defaultValue: 'Delete' }),
          cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
        });
        if (!confirmed) return;

        // Deleting a folder after one of its own children is already gone is fine, so
        // failures are collected rather than allowed to abort the rest.
        const failed: string[] = [];
        for (const id of ids) {
          try {
            await ws.delete(id, true);
          } catch {
            failed.push(id);
          }
        }

        await reload();
        if (failed.length > 0) {
          toast.error(
            t('agent.workspace.deleteFailed', {
              defaultValue: `Could not delete ${failed.length} of ${ids.length} items.`,
              count: failed.length,
              total: ids.length,
            }),
          );
        }
      },
      [reload, t, ws],
    );

    // ─── Row handlers ─────────────────────────────────────────────────────

    const handlers: WorkspaceMenuHandlers = {
      onOpen: onOpenFile,
      onCopyContent: async (path) => {
        try {
          const { content } = await ws.read(path);
          await navigator.clipboard.writeText(content);
          toast.success(
            t('snippets.copiedToClipboard', { defaultValue: 'Copied' }),
            1000,
          );
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      onDownload: async (path) => {
        try {
          await downloadFile(workspaceId, path);
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      onDownloadZip,
      onCreateFolder,
      onCreateFile,
      onUploadTo,
      onDelete: (path) => void handleDeleteItems([path]),
    };

    return (
      <FolderTree
        ref={treeRef}
        data={data}
        storageKey={`workspace-tree:${workspaceId}`}
        folders={folders}
        searchTerm={searchTerm}
        onMoveItem={handleMoveItem}
        onRenameItem={handleRenameItem}
        onDeleteItems={handleDeleteItems}
        // Creation is driven from the header and the row menus, which already know the
        // parent path. `FolderTree` requires the prop but never calls it itself.
        onCreateFolder={async () => null}
        renderNode={(props) => (
          <WorkspaceNode {...props} handlers={handlers} searchQuery={searchTerm} />
        )}
      />
    );
  },
);

WorkspaceFileTree.displayName = 'WorkspaceFileTree';
