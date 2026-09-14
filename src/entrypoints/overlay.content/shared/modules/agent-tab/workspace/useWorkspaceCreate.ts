/**
 * Creating a folder or a file, from the header or from a row's menu.
 *
 * Lives above the tree rather than inside it, because an empty workspace renders no tree
 * at all — and that is exactly when someone reaches for "New folder". Owned by the tree,
 * these would have been unreachable in the one state that most needs them.
 *
 * The tree is still involved: after the entry exists, it has to be expanded into view and
 * put into inline rename. That is what `treeRef` is for, and why it is optional — when
 * there is no tree yet, creation still succeeds and the reload brings it on screen with
 * its placeholder name, which the user can rename afterwards.
 *
 * ## Create, then rename
 *
 * Rather than prompting for a name in a dialog first. It matches how Snippets and Library
 * behave, and it means the name is typed in place, next to its siblings, where a duplicate
 * or an odd abbreviation is obvious. The cost is a placeholder entry on disk if the user
 * walks away mid-rename — a stray "New folder" is a smaller problem than a modal.
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { showPowerPackPaywall } from '@/shared/lib/powerpack-paywall';
import { forWorkspace } from '@/shared/workspace/client';
import { fileBudget } from '@/shared/workspace/limits';

/** Minimum the tree has to expose for a new entry to be revealed and renamed. */
export interface RevealTarget {
  open: (id: string) => void;
  edit: (id: string) => void;
}

export interface UseWorkspaceCreateResult {
  createFolder: (parentPath: string) => Promise<void>;
  createFile: (parentPath: string) => Promise<void>;
}

export function useWorkspaceCreate(
  workspaceId: string,
  reload: () => Promise<void>,
  treeRef: RefObject<RevealTarget | null>,
): UseWorkspaceCreateResult {
  const { t } = useI18n();

  /**
   * First unused name in `parentPath`, as `stem-1.ext`, `stem-2.ext`, …
   *
   * OPFS creates on write, so a second "New folder" would land on top of the first with
   * no complaint. Asking the filesystem rather than guessing is what makes the button
   * repeatable.
   */
  const freeName = useCallback(
    async (parentPath: string, base: string): Promise<string> => {
      const ws = forWorkspace(workspaceId);
      const dot = base.lastIndexOf('.');
      const stem = dot <= 0 ? base : base.slice(0, dot);
      const ext = dot <= 0 ? '' : base.slice(dot);
      const join = (name: string) => (parentPath ? `${parentPath}/${name}` : name);

      for (let n = 0; n < 200; n++) {
        const name = n === 0 ? base : `${stem}-${n}${ext}`;
        if (!(await ws.stat(join(name)))) return name;
      }
      // 200 collisions means something is wrong with the assumption, not with this file.
      // A timestamp is guaranteed free and ends the loop rather than failing.
      return `${stem}-${Date.now()}${ext}`;
    },
    [workspaceId],
  );

  const create = useCallback(
    async (parentPath: string, base: string, write: (path: string) => Promise<void>) => {
      try {
        const name = await freeName(parentPath, base);
        const path = parentPath ? `${parentPath}/${name}` : name;

        await write(path);
        await reload();

        if (parentPath) treeRef.current?.open(parentPath);
        // Deferred: the row does not exist until the reloaded data has rendered, and
        // `edit` on an id the tree does not know is silently a no-op.
        setTimeout(() => treeRef.current?.edit(path), 300);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [freeName, reload, treeRef],
  );

  const createFolder = useCallback(
    (parentPath: string) =>
      create(
        parentPath,
        t('node.newFolderName', { defaultValue: 'New folder' }),
        (path) => forWorkspace(workspaceId).mkdir(path),
      ),
    [create, t, workspaceId],
  );

  /**
   * The free tier's file cap.
   *
   * Checked when the button is pressed rather than used to disable it. A greyed-out "New
   * file" says only that something is wrong; the same button opening the upgrade card
   * says what the limit is and what lifts it. Folders are not counted, so "New folder"
   * stays unconditional — a cap on files that also stopped you organising the five you
   * have would read as a bug rather than a plan.
   */
  const withinFileBudget = useCallback(async (): Promise<boolean> => {
    const budget = await fileBudget(workspaceId);
    if (budget.remaining > 0) return true;
    showPowerPackPaywall(
      t('agent.workspace.paywallFiles', {
        defaultValue: `More than ${budget.max} files in a workspace`,
        max: budget.max,
      }),
    );
    return false;
  }, [t, workspaceId]);

  const createFile = useCallback(
    // `.md` because the reader renders Markdown and the agent writes notes. Someone who
    // wanted a different extension types it into the rename input that opens next.
    async (parentPath: string) => {
      if (!(await withinFileBudget())) return;
      await create(parentPath, 'untitled.md', async (path) => {
        await forWorkspace(workspaceId).write(path, '');
      });
    },
    [create, withinFileBudget, workspaceId],
  );

  return { createFolder, createFile };
}
