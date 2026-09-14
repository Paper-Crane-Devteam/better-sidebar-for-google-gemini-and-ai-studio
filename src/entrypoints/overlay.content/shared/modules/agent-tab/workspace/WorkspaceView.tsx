/**
 * WorkspaceView — the Agent tab, showing files instead of the launcher.
 *
 * Replaces the tab's contents rather than opening a dialog or claiming a tab of its own.
 * The workspace only means anything in the context of the agent that writes to it, and a
 * sidebar this narrow has no room for a second panel.
 *
 * ## No longer read-only
 *
 * It began as a viewer on the assumption that the agent is the only author. That held
 * until the workspace had to be somewhere you *put* things — reference notes, a spec, a
 * CSV to work through — at which point a browser-private filesystem with no way in and no
 * way out was the feature's main limitation rather than a detail of it. So: create,
 * rename, move, delete, upload by picker or by drop, download one entry or the whole tree
 * as a ZIP.
 *
 * ## Composition
 *
 * This file is layout and workspace-level concerns only. The three things with real logic
 * live next door, because each is substantial enough to reason about on its own:
 *
 * - `useWorkspaceFiles` — listing, tree assembly, search filtering.
 * - `WorkspaceFileTree` — per-entry filesystem operations, and the tree itself.
 * - `useWorkspaceTransfer` — upload and export, with their progress and reporting.
 */

import React, { useCallback, useRef, useState } from 'react';
import { FilePlus, Loader2, Upload } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { showPowerPackPaywall } from '@/shared/lib/powerpack-paywall';
import { forWorkspace } from '@/shared/workspace/client';
import { canCreateWorkspace } from '@/shared/workspace/limits';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { toolCallRecorder } from '../../agent-loop/records';
import {
  useWorkspaceStore,
  DEFAULT_WORKSPACE_ID,
} from '../../agent-loop/workspace/workspace-store';
import {
  primeBinding,
  useBoundWorkspaceId,
} from '../../agent-loop/workspace/workspace-binding';
import { useFileViewerStore } from '../../agent-loop/workspace/file-viewer-store';
import { releaseNativeDrag } from '../../../components/folder-tree/dnd-manager';
import { useWorkspaceFiles } from './useWorkspaceFiles';
import { useWorkspaceTransfer } from './useWorkspaceTransfer';
import { useWorkspaceCreate } from './useWorkspaceCreate';
import { promptWorkspaceName } from './promptWorkspaceName';
import { WorkspaceFileTree, type WorkspaceFileTreeHandle } from './WorkspaceFileTree';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface WorkspaceViewProps {
  /**
   * Return to whatever showed this. Omitted when the workspace *is* the destination.
   *
   * It used to be a sub-view of the launcher, so a back arrow was the only way out. Now the
   * Workspace agent owns the tab and the agent switcher above it is the way out — a back
   * arrow there would point at the previous agent, which is not "back" in any sense the
   * user means.
   */
  onBack?: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ onBack }) => {
  const { t } = useI18n();

  const activeId = useWorkspaceStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);

  const conversationId = toolCallRecorder.currentConversationId;
  const lockedId = useBoundWorkspaceId(conversationId);
  const busy = useAgentLoopStore((s) => s.status) !== 'idle';

  /**
   * A locked conversation is shown *its* workspace, not the selected one.
   *
   * The tree has to agree with where the agent is actually writing, or the panel becomes
   * an argument against the files the transcript describes.
   */
  const shownId = lockedId ?? activeId;

  const openFile = useFileViewerStore((s) => s.openFile);
  const closeFile = useFileViewerStore((s) => s.close);

  const [searchTerm, setSearchTerm] = useState('');
  const treeRef = useRef<WorkspaceFileTreeHandle>(null);

  // `fileCount` is not displayed — it only decides whether the destructive menu items are
  // reachable, and fills in the confirmation copy.
  const { data, folders, fileCount, loading, error, reload } = useWorkspaceFiles(
    shownId,
    searchTerm,
  );

  const transfer = useWorkspaceTransfer(shownId, reload);
  // Owned here, not by the tree: an empty workspace renders no tree, and that is exactly
  // when "New folder" gets used.
  const { createFolder, createFile } = useWorkspaceCreate(shownId, reload, treeRef);

  const current = workspaces.find((w) => w.id === shownId);
  const workspaceName = current?.name ?? shownId;
  const isDefault = shownId === DEFAULT_WORKSPACE_ID;

  // The lock lives in the database; the switcher needs it before its first paint or it
  // would briefly offer a dropdown for a conversation that cannot switch.
  React.useEffect(() => {
    void primeBinding(conversationId);
  }, [conversationId]);

  /**
   * Reset per-workspace view state on a switch.
   *
   * A file open from the previous workspace has no meaning in this one, and the reader
   * sits outside this component — so it would otherwise stay up. The search term goes
   * too: carrying it across would show an empty tree and no obvious reason why.
   */
  React.useEffect(() => {
    closeFile();
    setSearchTerm('');
  }, [shownId, closeFile]);

  const handleCreate = async () => {
    /**
     * The free tier's one-workspace limit, answered before the name prompt.
     *
     * The switcher still offers "New workspace" — a hidden or disabled entry teaches
     * nothing, and this is the one place where a second workspace is on someone's mind.
     * Asking for a name first and refusing afterwards would be worse than either.
     */
    if (!canCreateWorkspace(workspaces.length)) {
      showPowerPackPaywall(
        t('agent.workspace.paywallWorkspaces', {
          defaultValue: 'More than one workspace',
        }),
      );
      return;
    }

    const name = await promptWorkspaceName({
      title: t('agent.workspace.create', { defaultValue: 'New workspace' }),
      confirmText: t('common.create', { defaultValue: 'Create' }),
    });
    // Null means cancelled or left blank — both mean "don't create one".
    if (!name) return;
    // `createWorkspace` selects the new workspace, which is what makes the tree switch
    // to it. A locked conversation keeps showing its own (see `shownId`).
    createWorkspace(name);
  };

  /**
   * Delete the workspace and its files.
   *
   * Warns when conversations are bound to it: those chats keep their binding and will
   * report a missing workspace on their next file call, which is worth knowing before
   * confirming rather than discovering later.
   */
  const handleDelete = async () => {
    if (isDefault) return;
    const confirmed = await modal.confirmDelete({
      title: t('agent.workspace.deleteTitle', { defaultValue: 'Delete workspace' }),
      content: t('agent.workspace.deleteWarning', {
        defaultValue:
          `Delete "${workspaceName}" and all ${fileCount} file(s) in it? ` +
          'Conversations that already used this workspace will no longer be able to ' +
          'read or write files. This cannot be undone.',
      }),
    });
    if (!confirmed) return;

    try {
      // Files first: dropping the registry entry before the data would leave an
      // unreachable directory occupying quota with nothing pointing at it.
      await forWorkspace(shownId).clear();
      removeWorkspace(shownId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleClear = async () => {
    const confirmed = await modal.confirmDelete({
      title: t('agent.workspace.clearTitle', { defaultValue: 'Clear workspace' }),
      content: t('agent.workspace.clearWarning', {
        defaultValue: `Delete all ${fileCount} file(s) in "${workspaceName}"? This cannot be undone.`,
      }),
    });
    if (!confirmed) return;

    try {
      await forWorkspace(shownId).clear();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ─── Drop target ──────────────────────────────────────────────────────────

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  /**
   * Nesting depth of the current drag.
   *
   * `dragleave` fires every time the pointer crosses into a child element, so a single
   * counter is what keeps the overlay from flickering off as the cursor moves between
   * rows. Incremented on enter, decremented on leave, hidden at zero.
   */
  const dragDepth = useRef(0);

  /**
   * Whether this drag is files from outside, rather than a row being moved inside.
   *
   * react-arborist runs its own HTML5 drag for node moves, and that drag carries no
   * `Files` type. Checking for it is what lets both live on the same element: an internal
   * move passes straight through to arborist, an external drop is claimed here.
   */
  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files');

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current++;
    setIsDraggingFiles(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    // Both calls are required. Without `preventDefault` on *every* dragover the drop is
    // rejected outright, and `dropEffect` is what makes the cursor show a copy affordance
    // instead of the "not allowed" sign.
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingFiles(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      // Stopping propagation matters beyond tidiness: the host page has its own file-drop
      // handling, and letting the event reach it would hand our files to the chat
      // composer instead of the workspace.
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setIsDraggingFiles(false);

      // Because the line above stopped the event, react-dnd's bubble-phase `drop`
      // listener never runs and the native drag it opened on `dragenter` is never closed.
      // See `releaseNativeDrag`.
      releaseNativeDrag();

      // Dropped at the root rather than onto the row under the cursor. Resolving a target
      // folder mid-drag would need arborist's hover state, and a wrong guess silently
      // buries files somewhere the user did not look — the root is always predictable,
      // and the row menus offer "Upload files here" when a specific folder is wanted.
      void transfer.dropFiles(e.dataTransfer, '');
    },
    [transfer],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const isFiltered = searchTerm.trim() !== '';

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <WorkspaceToolbar
        isEmpty={fileCount === 0}
        canDelete={!isDefault}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        progress={transfer.progress}
        onBack={onBack}
        onCollapseAll={() => treeRef.current?.collapseAll()}
        onNewFolder={() => void createFolder('')}
        onNewFile={() => void createFile('')}
        onImportFiles={() => transfer.pickFiles('')}
        onImportFolder={() => transfer.pickFolder('')}
        onExportZip={() => void transfer.exportZip('', workspaceName)}
        onClear={handleClear}
        onDelete={handleDelete}
      />

      {/*
        The tree area, which is also the drop target.
        `min-h-0` is load-bearing: `FolderTree` sizes itself from this element via a
        ResizeObserver, and a flex child without it grows to its content instead of being
        constrained, leaving the virtualised list with no height to work in.
      */}
      <div
        className="relative min-h-0 flex-1"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="px-3 py-4 text-xs text-destructive">{error}</p>
        ) : (
          /*
            Mounted even when there is nothing to show, with the empty state layered over
            it rather than swapped in.

            Not cosmetic. Swapping the tree out on `data.length === 0` means it mounts
            afresh the moment the first file lands, and a react-arborist tree appearing
            where there was none is what triggered "Cannot have two HTML5 backends at the
            same time" (see `folder-tree/dnd-manager`). That specific fault is fixed at the
            source now, but a tree that comes and goes also drops its expand state and
            makes react-dnd set up and tear down its backend on every transition between
            empty and not. Every other tab keeps its tree mounted; so does this one.
          */
          <WorkspaceFileTree
            ref={treeRef}
            // Remount on switch: `FolderTree` reads its persisted expand state once, at
            // mount, so a new `storageKey` alone would not take effect.
            key={shownId}
            workspaceId={shownId}
            data={data}
            folders={folders}
            searchTerm={searchTerm}
            reload={reload}
            onOpenFile={(path) => openFile(shownId, path)}
            onUploadTo={(dirPath) => transfer.pickFiles(dirPath)}
            onCreateFolder={(dirPath) => void createFolder(dirPath)}
            onCreateFile={(dirPath) => void createFile(dirPath)}
            onDownloadZip={(dirPath) =>
              void transfer.exportZip(
                dirPath,
                dirPath.slice(dirPath.lastIndexOf('/') + 1) || workspaceName,
              )
            }
          />
        )}

        {/*
          Empty state, over the mounted-but-empty tree.

          `pointer-events-none` on the wrapper so the drop target underneath still
          receives the drag this text is inviting; the two buttons opt back in with
          `pointer-events-auto`, since a button that cannot be clicked is worse than
          no button.

          The buttons repeat what the header's `+` menu already offers, and that
          repetition is the point: an empty tree is the one moment where the next
          step is genuinely unclear, and the menu behind a `+` icon is not
          discoverable enough to count as an answer. They are gone when the tree is
          only empty because of a search — the fix there is to clear the search, not
          to add a file.
        */}
        {!loading && !error && data.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-3 px-3 py-4">
            <p className="text-xs text-muted-foreground">
              {isFiltered
                ? t('agent.workspace.noMatches', {
                    defaultValue: 'No files match that search.',
                  })
                : t('agent.workspace.empty', {
                    defaultValue:
                      'No files yet. Drop files here, or ask the agent to write something.',
                  })}
            </p>

            {!isFiltered && (
              <div className="pointer-events-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => transfer.pickFiles('')}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('agent.workspace.importFiles', {
                    defaultValue: 'Import files…',
                  })}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => void createFile('')}
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  {t('agent.workspace.newFile', { defaultValue: 'New file' })}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Drop affordance. `pointer-events-none` so it cannot swallow the drop it is
            advertising — the handlers live on the container underneath. */}
        {isDraggingFiles && (
          <div
            className={cn(
              'pointer-events-none absolute inset-1 z-10 flex flex-col items-center justify-center gap-2',
              'rounded-md border-2 border-dashed border-primary/60 bg-background/85',
            )}
          >
            <Upload className="h-5 w-5 text-primary" />
            <span className="px-4 text-center text-xs font-medium text-foreground">
              {t('agent.workspace.dropHint', {
                defaultValue: 'Drop files or folders to add them to this workspace',
              })}
            </span>
          </div>
        )}
      </div>

      {/*
        Hidden pickers, driven by `useWorkspaceTransfer`.
        `webkitdirectory` is the only way to select a folder; it is non-standard but
        implemented in every browser this extension supports, and there is no alternative
        to fall back to.
      */}
      <input
        ref={transfer.fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={transfer.onInputChange}
      />
      <input
        ref={transfer.dirInputRef}
        type="file"
        multiple
        // @ts-expect-error — non-standard, and absent from React's prop types.
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={transfer.onInputChange}
      />

      {/* Deleting the workspace now lives in the header's three-dot menu, next to Clear.
          A standing button for an irreversible action was too easy to reach for. */}

      <WorkspaceSwitcher
        currentId={shownId}
        lockedId={lockedId}
        busy={busy}
        onCreate={handleCreate}
      />
    </div>
  );
};
