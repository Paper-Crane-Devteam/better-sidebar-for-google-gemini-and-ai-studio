import { trace } from '@/shared/lib/trace';

export class ChatContentScanner {
    private listener: (event: Event) => void;
    private isListening: boolean = false;

    constructor() {
        this.listener = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail && customEvent.detail.messages && customEvent.detail.messages.length > 0) {
                const { conversationId, messages, title, replaceAfterMessageId } = customEvent.detail;
                trace('Gemini ChatContentScanner: Received chat content', messages.length, 'messages');
                
                // Send to background to upsert
                browser.runtime.sendMessage({
                    type: 'UPSERT_MESSAGES',
                    payload: {
                        conversationId,
                        messages,
                        title,
                        replaceAfterMessageId,
                    },
                    platform: 'gemini'
                }).then(response => {
                    if (response?.success) {
                        trace('Gemini ChatContentScanner: Successfully synced messages');
                    } else {
                        console.error('Gemini ChatContentScanner: Failed to sync messages', response?.error);
                    }
                }).catch(err => {
                    console.error('Gemini ChatContentScanner: Error sending message', err);
                });
            }
        };
    }

    start() {
        if (this.isListening) return;
        trace('Gemini ChatContentScanner: Started listening for GEMINI_CHAT_CONTENT_RESPONSE');
        window.addEventListener('GEMINI_CHAT_CONTENT_RESPONSE', this.listener);
        this.isListening = true;
    }

    stop() {
        trace('Gemini ChatContentScanner: Stopped listening');
        window.removeEventListener('GEMINI_CHAT_CONTENT_RESPONSE', this.listener);
        this.isListening = false;
    }
}

export const chatContentScanner = new ChatContentScanner();
