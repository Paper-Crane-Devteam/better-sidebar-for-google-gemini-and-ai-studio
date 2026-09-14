import { trace } from '@/shared/lib/trace';

/**
 * ApiScanner collects items from AI_STUDIO_LIBRARY_DATA events
 * Used during manual scans to accumulate all API responses
 */
export class ApiScanner {
    private items: any[] = [];
    private listener: (event: Event) => void;
    private isListening: boolean = false;

    constructor() {
        this.listener = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail && customEvent.detail.items) {
                trace('ApiScanner: Received items batch', customEvent.detail.items.length);
                this.items.push(...customEvent.detail.items);
            }
        };
    }

    start() {
        if (this.isListening) return;
        trace('ApiScanner: Started listening for AI_STUDIO_LIBRARY_DATA');
        // this.clear(); // comment this, this will cause the scan fail if the page is in hitory page as it collides with sync conversation
        window.addEventListener('AI_STUDIO_LIBRARY_DATA', this.listener);
        this.isListening = true;
    }

    stop() {
        trace('ApiScanner: Stopped listening');
        window.removeEventListener('AI_STUDIO_LIBRARY_DATA', this.listener);
        this.isListening = false;
        return this.items;
    }

    getItems() {
        return this.items;
    }

    clear() {
        this.items = [];
    }

    isActive() {
        return this.isListening;
    }
}

export const apiScanner = new ApiScanner();
