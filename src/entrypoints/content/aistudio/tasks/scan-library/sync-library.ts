import { Platform } from '@/shared/types/platform';
import { trace } from '@/shared/lib/trace';

/**
 * Auto-sync handler for AI Studio Library
 * Listens to AI_STUDIO_LIBRARY_DATA events and automatically syncs new conversations
 * This is used when the page naturally loads (not during manual scans)
 */
class AutoSyncHandler {
    private isEnabled: boolean = false;
    private listener: (event: Event) => void;

    constructor() {
        this.listener = async (event: Event) => {
            const customEvent = event as CustomEvent;
            if (!customEvent.detail || !customEvent.detail.items) return;

            const items = customEvent.detail.items;
            trace(`AutoSync: Received ${items.length} items from API`);

            // Transform to conversation format
            const conversations = items
                .filter((item: any) => item && item.id)
                .map((item: any) => ({
                    ...item,
                    id: item.id,
                    title: item.title,
                    external_id: item.id,
                    external_url: `https://aistudio.google.com/prompts/${item.id}`,
                    // ListPrompts only exposes a last-active timestamp.
                    // `created_at` is intentionally omitted so the DB upsert's
                    // COALESCE keeps any real creation time captured on the
                    // create path.
                    updated_at: item.last_active_at ?? Math.floor(Date.now() / 1000),
                    last_active_at: item.last_active_at ?? Math.floor(Date.now() / 1000),
                    prompt_metadata: item.prompt_metadata,
                    type: item.type,
                }));

            if (conversations.length > 0) {
                try {
                    await browser.runtime.sendMessage({
                        type: 'SYNC_CONVERSATIONS',
                        payload: { items: conversations },
                    });
                    console.log(`AutoSync: Synced ${conversations.length} conversations`);
                } catch (err) {
                    console.error('AutoSync: Failed to sync conversations:', err);
                }
            }
        };
    }

    /**
     * Start auto-syncing library data
     */
    start() {
        if (this.isEnabled) return;
        trace('AutoSync: Started listening for AI_STUDIO_LIBRARY_DATA');
        window.addEventListener('AI_STUDIO_LIBRARY_DATA', this.listener);
        this.isEnabled = true;
    }

    /**
     * Stop auto-syncing
     */
    stop() {
        if (!this.isEnabled) return;
        trace('AutoSync: Stopped listening');
        window.removeEventListener('AI_STUDIO_LIBRARY_DATA', this.listener);
        this.isEnabled = false;
    }

    isActive() {
        return this.isEnabled;
    }
}

export const autoSyncHandler = new AutoSyncHandler();
