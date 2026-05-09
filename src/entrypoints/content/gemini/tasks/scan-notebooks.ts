import i18n from '@/locale/i18n';
import { navigate } from '@/shared/lib/navigation';
import { Platform } from '@/shared/types/platform';

/**
 * Listens for `GEMINI_NOTEBOOK_LIST_RESPONSE` events (dispatched from the
 * main-world CNgdBe interceptor) and persists the returned notebooks.
 *
 * Also exposes `scanNotebooks()` which navigates to the notebook list page,
 * letting the page's own XHR trigger the listener. This mirrors the gem
 * scanning flow but piggy-backs on the native page load instead of DOM
 * scraping — the list is returned in one response.
 */
export class NotebookListScanner {
  private listener: (event: Event) => void;
  private isListening = false;

  constructor() {
    this.listener = (event: Event) => {
      const { notebooks } = (event as CustomEvent).detail || {};
      if (!Array.isArray(notebooks) || notebooks.length === 0) return;

      const payload = notebooks.map((nb: any) => ({
        id: nb.id,
        name: nb.name || i18n.t('notebooks.untitledNotebook'),
        external_id: nb.id,
        external_url: `https://gemini.google.com/notebook/notebooks%2F${nb.id}`,
        platform: Platform.GEMINI,
        created_at: nb.created_at ?? undefined,
      }));

      browser.runtime
        .sendMessage({
          type: 'SAVE_NOTEBOOKS',
          payload: { notebooks: payload },
        })
        .then(() => {
          console.log(
            `Better Sidebar (Gemini): Saved ${payload.length} notebooks`,
          );
        })
        .catch((err) => {
          console.error(
            'Better Sidebar (Gemini): Failed to save notebooks',
            err,
          );
        });
    };
  }

  start() {
    if (this.isListening) return;
    console.log(
      'Better Sidebar (Gemini): NotebookListScanner started',
    );
    window.addEventListener('GEMINI_NOTEBOOK_LIST_RESPONSE', this.listener);
    this.isListening = true;
  }

  stop() {
    window.removeEventListener('GEMINI_NOTEBOOK_LIST_RESPONSE', this.listener);
    this.isListening = false;
  }
}

export const notebookListScanner = new NotebookListScanner();

/**
 * Trigger a notebook list refresh by navigating to the notebook landing page.
 * The CNgdBe request fires automatically on that page, so we just need to
 * ensure we're listening when it returns.
 */
export async function scanNotebooks(): Promise<number> {
  notebookListScanner.start();

  // Capture the count by wiring a one-shot listener on top of the existing one.
  let count = 0;
  const onResponse = (e: Event) => {
    const { notebooks } = (e as CustomEvent).detail || {};
    if (Array.isArray(notebooks)) count = notebooks.length;
  };
  window.addEventListener('GEMINI_NOTEBOOK_LIST_RESPONSE', onResponse);

  // Only navigate if we aren't already on the notebooks page — otherwise
  // trigger a page-level re-fetch by reloading the hash.
  const onNotebookPage =
    location.pathname.startsWith('/notebooks') ||
    location.pathname.startsWith('/notebook');
  if (!onNotebookPage) {
    navigate('https://gemini.google.com/notebooks/view');
  } else {
    // Force a reload of the current notebook list
    navigate('https://gemini.google.com/notebooks/view');
  }

  // Wait a few seconds for the list to come back
  await new Promise((r) => setTimeout(r, 3500));
  window.removeEventListener('GEMINI_NOTEBOOK_LIST_RESPONSE', onResponse);
  return count;
}
