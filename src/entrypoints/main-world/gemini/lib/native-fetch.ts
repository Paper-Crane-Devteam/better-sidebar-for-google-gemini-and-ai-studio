/**
 * `fetch` as it was before the interceptor wrapped it.
 *
 * Captured at module evaluation, which happens on import — before
 * `initGeminiInterceptors()` replaces `window.fetch`. The extension's own requests
 * (request builder, backfill) go through this so their responses are not fed back into
 * the interceptors as if the page had made them.
 */
export const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);
