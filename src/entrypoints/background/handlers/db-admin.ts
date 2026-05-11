import { rawSql, dbAdmin } from '@/shared/db/operations';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataUpdated } from '../notify';
import { getCurrentDbName } from '../tab-profile-map';

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

export async function handleDbAdmin(
  message: ExtensionMessage,
  sender: MessageSender
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'EXECUTE_SQL': {
      try {
        const result = await rawSql.execute(message.payload.sql);
        return { success: true, data: result };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    case 'RESET_DATABASE': {
      try {
        await dbAdmin.resetDatabase();
        await notifyDataUpdated();

        // Clear sync timestamps so next merge treats everything as first-ever sync
        const dbName = getCurrentDbName();
        const syncMetaKey = `gdrive_last_sync_time__${dbName}`;
        const syncDirKey = `gdrive_last_sync_dir__${dbName}`;
        await browser.storage.local.remove([syncMetaKey, syncDirKey]);

        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    case 'VACUUM_DATABASE': {
      try {
        await dbAdmin.vacuum();
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    case 'EXPORT_DATABASE': {
      try {
        const data = await dbAdmin.export();
        if (data.length <= CHUNK_SIZE) {
          return { success: true, data };
        }

        const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
        const transferId = crypto.randomUUID();
        (async () => {
          for (let i = 0; i < totalChunks; i++) {
            const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const msg = {
              type: 'EXPORT_CHUNK',
              payload: { transferId, chunk, index: i, total: totalChunks },
            };
            try {
              if (sender.tab?.id) {
                await browser.tabs.sendMessage(sender.tab.id, msg);
              } else {
                await browser.runtime.sendMessage(msg);
              }
            } catch (err) {
              console.error('[Background] Failed to send export chunk', i, err);
              break;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
        })();
        return { success: true, data: { chunked: true, transferId, totalChunks } };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    case 'IMPORT_DATABASE': {
      try {
        const { data, chunk } = message.payload;
        await dbAdmin.import(data, chunk);
        if (!chunk || chunk.index === chunk.total - 1) {
          await notifyDataUpdated();
        }
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    default:
      return null;
  }
}
