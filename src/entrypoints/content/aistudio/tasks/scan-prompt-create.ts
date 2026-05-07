import { getExternalUrl } from '@/entrypoints/overlay.content/shared/utils';

/**
 * Listens for BETTER_SIDEBAR_PROMPT_CREATE events dispatched from the main
 * world (fired when aistudio's CreatePrompt RPC returns) and persists a
 * minimal conversation record to the database as early as possible.
 *
 * Rationale: the overlay's ExplorerTab listens for the same event to issue a
 * MOVE_CONVERSATION when the user has a folder selected. Without this scanner,
 * the MOVE request races with SAVE_CONVERSATION (dispatched later from
 * AI_STUDIO_RESPONSE), and if MOVE wins, it silently no-ops because the row
 * does not exist yet — leaving the new conversation stranded at the root.
 *
 * By registering this listener at content-script init time, it runs before
 * the overlay handler (listener insertion order) and ensures the row exists
 * before MOVE runs. A later SAVE_CONVERSATION from AI_STUDIO_RESPONSE will
 * upsert the full data while preserving folder_id via COALESCE.
 *
 * folder_id is intentionally null here — ExplorerTab follows up with MOVE.
 */
export class PromptCreateScanner {
  private listener: (event: Event) => void;
  private isListening = false;

  constructor() {
    this.listener = async (event: Event) => {
      const { id, title, prompt_metadata, created_at, type } =
        (event as CustomEvent).detail;

      if (!id) return;

      console.log(
        'Better Sidebar (AI Studio): PromptCreateScanner received BETTER_SIDEBAR_PROMPT_CREATE',
        id,
      );

      try {
        await browser.runtime.sendMessage({
          type: 'SAVE_CONVERSATION',
          payload: {
            id,
            title,
            prompt_metadata,
            created_at,
            last_active_at: created_at,
            external_id: id,
            external_url: getExternalUrl(id),
            folder_id: null,
            type,
            platform: 'aistudio',
          },
        });
      } catch (e) {
        console.error(
          'Better Sidebar (AI Studio): PromptCreateScanner failed to save conversation',
          e,
        );
      }
    };
  }

  start() {
    if (this.isListening) return;
    window.addEventListener('BETTER_SIDEBAR_PROMPT_CREATE', this.listener);
    this.isListening = true;
  }

  stop() {
    window.removeEventListener('BETTER_SIDEBAR_PROMPT_CREATE', this.listener);
    this.isListening = false;
  }
}

export const promptCreateScanner = new PromptCreateScanner();
