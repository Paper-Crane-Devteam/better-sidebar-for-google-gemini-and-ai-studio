import { runCommand } from '../index';
import { updateWithTimestamp } from './helpers';

export type PinnableTable = 'folders' | 'prompt_folders' | 'gems' | 'notebooks' | 'collection_folders';

export const pinRepo = {
  /**
   * Toggle pin state for an item in any of the pinnable tables.
   * Returns the new is_pinned value (0 or 1).
   */
  togglePin: async (table: PinnableTable, id: string, currentlyPinned: boolean): Promise<number> => {
    const newValue = currentlyPinned ? 0 : 1;
    await updateWithTimestamp(table, id, { is_pinned: newValue });
    return newValue;
  },

  /**
   * Set pin state explicitly.
   */
  setPin: async (table: PinnableTable, id: string, pinned: boolean): Promise<void> => {
    await updateWithTimestamp(table, id, { is_pinned: pinned ? 1 : 0 });
  },

  /**
   * Unpin all items in a table (useful for bulk operations).
   */
  unpinAll: async (table: PinnableTable): Promise<void> => {
    await runCommand(
      `UPDATE ${table} SET is_pinned = 0, updated_at = unixepoch() WHERE is_pinned = 1`,
    );
  },
};
