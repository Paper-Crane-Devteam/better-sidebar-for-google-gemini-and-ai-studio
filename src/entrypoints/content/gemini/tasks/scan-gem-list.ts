import { trace } from '@/shared/lib/trace';

interface ListedGem {
  id: string;
  name: string;
  description?: string;
}

/**
 * Mirrors the user's own gem list into the database whenever Gemini fetches it.
 *
 * The list is authoritative and complete, so it is upserted as a whole; a gem the
 * user just created arrives this way too, because the UI re-fetches the list after
 * creating one. Unchanged rows are left untouched by `bulkSave`, so the page-load
 * refetch costs a query, not a sync.
 */
class GemListScanner {
  private isListening = false;

  private readonly listener = (event: Event) => {
    const gems = ((event as CustomEvent).detail?.gems ?? []) as ListedGem[];
    if (gems.length === 0) return;

    browser.runtime
      .sendMessage({
        type: 'SAVE_GEMS',
        platform: 'gemini',
        payload: {
          gems: gems.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            external_id: g.id,
            external_url: `https://gemini.google.com/gem/${g.id}`,
            platform: 'gemini',
          })),
        },
      })
      .then((response) => {
        if (response?.success) trace(`Gemini GemListScanner: upserted ${gems.length} gems`);
        else console.error('Gemini GemListScanner: save failed', response?.error);
      })
      .catch((err) => console.error('Gemini GemListScanner: save failed', err));
  };

  start() {
    if (this.isListening) return;
    window.addEventListener('GEMINI_GEM_LIST_RESPONSE', this.listener);
    this.isListening = true;
  }

  stop() {
    window.removeEventListener('GEMINI_GEM_LIST_RESPONSE', this.listener);
    this.isListening = false;
  }
}

export const gemListScanner = new GemListScanner();
