import { getExternalUrl } from '@/entrypoints/overlay.content/shared/utils';

/**
 * Listens for BETTER_SIDEBAR_PROMPT_CREATE events dispatched from the main world
 * and persists the conversation to the database.
 *
 * This runs at the content script level so it works regardless of which sidebar
 * tab (Explorer / Gems / etc.) is currently active.
 *
 * folder_id is intentionally left null here — if the user has a folder selected
 * in ExplorerTab, that tab will follow up with a MOVE_CONVERSATION to assign it.
 */
export class PromptCreateScanner {
  private listener: (event: Event) => void;
  private isListening = false;

  constructor() {
    this.listener = async (event: Event) => {
      const { id, title, prompt_metadata, created_at, type, messages, gem_id } =
        (event as CustomEvent).detail;

      if (!id) return;

      console.log(
        'Better Sidebar (Gemini): PromptCreateScanner received BETTER_SIDEBAR_PROMPT_CREATE',
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
            messages,
            gem_id: gem_id || undefined,
            platform: 'gemini',
          },
        });
      } catch (e) {
        console.error(
          'Better Sidebar (Gemini): PromptCreateScanner failed to save conversation',
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
