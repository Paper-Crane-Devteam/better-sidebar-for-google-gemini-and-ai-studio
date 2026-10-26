import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import { FolderPicker } from '@/shared/components/FolderPicker';
import type { CollectionScope } from '@/shared/types/db';
import { descendantFolderIds } from './collection-tree';
import { MoveItemsDialog } from '../explorer/components/batch/MoveItemsDialog';

/**
 * Pick the Library folder that new chats with this gem/notebook are filed into.
 * Unrelated to the panel's own folders.
 */
export async function setDefaultLibraryFolder(
  scope: CollectionScope,
  id: string,
  current: string | null,
): Promise<void> {
  const ns = scope === 'gems' ? 'gems' : 'notebooks';
  let targetFolderId: string | null = current;
  const confirmed = await modal.confirm({
    title: i18n.t(`${ns}.setDefaultFolder`),
    content: (
      <MoveItemsDialog
        selectedIds={[]}
        onSelect={(folderId) => (targetFolderId = folderId)}
        initialSelectedId={current}
      />
    ),
    modalClassName: 'max-w-xl',
    confirmText: i18n.t('common.save'),
    cancelText: i18n.t('common.cancel'),
  });
  if (!confirmed) return;

  await browser.runtime.sendMessage({
    type: scope === 'gems' ? 'UPDATE_GEM' : 'UPDATE_NOTEBOOK',
    payload: { id, updates: { default_folder_id: targetFolderId } },
  });
  await useAppStore.getState().fetchData(true, [scope]);
  toast.success(i18n.t(`${ns}.defaultFolderSet`));
}

const scopeFolders = (scope: CollectionScope) =>
  useAppStore.getState().collectionFolders.filter((f) => f.scope === scope);

/**
 * Pick a destination folder in the same panel and move a folder or a
 * gem/notebook there. A folder can't be moved into itself or below itself.
 */
export async function moveToCollectionFolder(
  scope: CollectionScope,
  target: { kind: 'folder' | 'item'; id: string; currentFolderId: string | null },
): Promise<void> {
  const folders = scopeFolders(scope);
  const excluded =
    target.kind === 'folder' ? [target.id, ...descendantFolderIds(folders, target.id)] : [];
  let destination: string | null = target.currentFolderId;

  const confirmed = await modal.confirm({
    title: i18n.t('batch.moveTitle'),
    content: (
      <FolderPicker
        folders={folders}
        selectedIds={excluded}
        initialSelectedId={target.currentFolderId}
        onSelect={(id) => (destination = id)}
        onCreateFolder={(name, parentId) =>
          useAppStore.getState().createCollectionFolder(scope, name, parentId)
        }
      />
    ),
    modalClassName: 'max-w-xl',
    confirmText: i18n.t('common.move'),
    cancelText: i18n.t('common.cancel'),
  });
  if (!confirmed || destination === target.currentFolderId) return;

  const store = useAppStore.getState();
  if (target.kind === 'folder') {
    await store.moveCollectionFolder(target.id, destination);
  } else {
    await store.moveCollectionItem(scope, target.id, destination);
  }
}

/**
 * Delete a panel folder, but only an empty one. Gems and notebooks live in
 * Gemini, so instead of taking them along the user is asked to empty it first.
 */
export async function deleteCollectionFolder(scope: CollectionScope, folderId: string) {
  const state = useAppStore.getState();
  const folder = state.collectionFolders.find((f) => f.id === folderId);
  if (!folder) return;

  const items = state[scope] as { folder_id: string | null }[];
  const hasContents =
    state.collectionFolders.some((f) => f.parent_id === folderId) ||
    items.some((i) => i.folder_id === folderId);
  if (hasContents) {
    toast.warning(i18n.t('collections.folderNotEmpty'));
    return;
  }

  const confirmed = await modal.confirmDelete({
    title: i18n.t('node.delete'),
    content: i18n.t('node.deleteFolderConfirm', { name: folder.name }),
  });
  if (!confirmed) return;

  // The background re-checks: something may have been filed in meanwhile.
  const deleted = await state.deleteCollectionFolder(folderId);
  if (!deleted) toast.warning(i18n.t('collections.folderNotEmpty'));
}
