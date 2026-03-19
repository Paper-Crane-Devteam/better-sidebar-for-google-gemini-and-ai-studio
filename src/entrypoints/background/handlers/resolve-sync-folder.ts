import { folderRepo } from '@/shared/db/operations';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import i18n from '@/locale/i18n';

/**
 * Resolve the folder ID to use for new synced/scanned conversations.
 *
 * - If user configured a specific folder → use that (verify it exists).
 * - If user configured '__root__' → return null (root level).
 * - Otherwise (null / default) → find or create the "Imported" folder.
 */
export async function resolveSyncFolderId(
  platform: string,
): Promise<string | null> {
  const configured = usePegasusStore.getState().defaultSyncFolderId;

  // User explicitly chose root level
  if (configured === '__root__') {
    return null;
  }

  // User chose a specific folder — verify it still exists
  if (configured) {
    const folder = await folderRepo.getById(configured);
    if (folder) return configured;
    // Folder was deleted — fall through to default "Imported" behavior
  }

  // Default: find or create "Imported" folder
  const importedName = i18n.t('explorer.imported');
  const folders = await folderRepo.getAll(platform);
  const existing = folders.find(
    (f) => f.name === importedName || f.name === 'Imported',
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await folderRepo.create({ id, name: importedName, platform });
  return id;
}
