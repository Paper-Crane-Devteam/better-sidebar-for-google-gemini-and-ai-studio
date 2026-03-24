export class GemCreationScanner {
  private listener: (event: Event) => void;
  private isListening = false;

  constructor() {
    this.listener = (event: Event) => {
      const { id, name } = (event as CustomEvent).detail;
      if (!id) return;

      console.log('Gemini GemCreationScanner: Detected new gem', id, name);

      browser.runtime
        .sendMessage({
          type: 'SAVE_GEM',
          payload: {
            id,
            name: name || 'Untitled Gem',
            external_id: id,
            external_url: `https://gemini.google.com/gems/${id}`,
            platform: 'gemini',
          },
        })
        .then((response) => {
          if (response?.success) {
            console.log('Gemini GemCreationScanner: Gem saved successfully');
            // Notify overlay about the newly created gem for "last created" shortcut
            window.dispatchEvent(
              new CustomEvent('BETTER_SIDEBAR_GEM_CREATED', {
                detail: { id, name },
              }),
            );
          }
        })
        .catch((err) => {
          console.error('Gemini GemCreationScanner: Error saving gem', err);
        });
    };
  }

  start() {
    if (this.isListening) return;
    console.log(
      'Gemini GemCreationScanner: Started listening for GEMINI_GEM_CREATED',
    );
    window.addEventListener('GEMINI_GEM_CREATED', this.listener);
    this.isListening = true;
  }

  stop() {
    window.removeEventListener('GEMINI_GEM_CREATED', this.listener);
    this.isListening = false;
  }
}

export const gemCreationScanner = new GemCreationScanner();
