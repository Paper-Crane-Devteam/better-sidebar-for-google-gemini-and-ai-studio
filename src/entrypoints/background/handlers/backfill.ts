import { conversationRepo } from '@/shared/db/operations';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import type { MessageSender } from '../types';

/**
 * Read side of the silent message backfill.
 *
 * The scheduler lives in the content script (it needs the page to issue the API
 * request), so all the background does here is answer "which conversations are
 * missing their transcript". Writes go through the existing message handlers —
 * there is nothing backfill-specific about storing a transcript.
 */
export async function handleBackfill(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_MESSAGE_SYNC_STATUS': {
      try {
        const rows = await conversationRepo.getMessageSyncStatus(
          message.payload.platform,
        );
        return { success: true, data: rows };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    case 'GET_BACKFILL_CANDIDATES': {
      try {
        const { platform, limit, staleSlackSec, excludeIds } = message.payload;
        const candidates = await conversationRepo.getBackfillCandidates(platform, {
          limit,
          staleSlackSec,
          excludeIds,
        });
        return { success: true, data: candidates };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }
    default:
      return null;
  }
}
