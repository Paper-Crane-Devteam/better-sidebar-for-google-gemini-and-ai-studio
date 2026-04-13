import { folderRepo } from '@/shared/db/operations';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import i18n from '@/locale/i18n';

/** Deterministic ID for the default sync folder, per platform. */
function getDefaultSyncFolderId(platform: string): string {
  return `__default_sync_folder__${platform}`;
}

/**
 * Resolve the folder ID to use for new synced/scanned conversations.
 *
 * - If user configured a specific folder → use that (verify it exists).
 * - If user configured '__root__' → return null (root level).
 * - Otherwise (null / default) → find or create the "Inbox" folder
 *   using a deterministic ID to avoid duplicates across devices/resets.
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
    // Folder was deleted — fall through to default "Inbox" behavior
  }

  // Default: find or create "Inbox" folder
  const importedName = i18n.t('explorer.imported');
  const folders = await folderRepo.getAll(platform);

  // First check by deterministic ID
  const deterministicId = getDefaultSyncFolderId(platform);
  const byId = folders.find((f) => f.id === deterministicId);
  if (byId) return byId.id;

  // Then check by name (handles legacy folders created with random UUIDs)
  const byName = folders.find(
    (f) => f.name === importedName || f.name === 'Inbox' || f.name === 'Imported',
  );
  if (byName) return byName.id;

  // Create with deterministic ID
  await folderRepo.create({ id: deterministicId, name: importedName, platform });
  return deterministicId;
}
