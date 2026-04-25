/**
 * Gemini native message IDs typically start with "r_" or "rc_" prefixes.
 * Non-native IDs are 32-char uppercase hex (fallback from bulkInsert when
 * the caller doesn't provide an id) or UUID v4 strings.
 */
export function looksLikeGeminiId(id: string): boolean {
  return (
    !/^[0-9A-F]{32}$/i.test(id) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/**
 * Find a message element in the DOM by its ID.
 * Gemini uses ids like `message-content-id-r_xxx`.
 */
export function findMessageElement(messageId: string): HTMLElement | null {
  const el = document.querySelector(
    `[id*="message-content-id-${messageId}"]`,
  ) as HTMLElement;
  if (el) return el;

  const allMessageEls = document.querySelectorAll('[id*="message-content-id"]');
  for (const candidate of allMessageEls) {
    if (candidate.id.includes(messageId)) {
      return candidate as HTMLElement;
    }
  }
  return null;
}

/** Get the scrollable chat container element. */
export function getChatScrollContainer(): HTMLElement | null {
  return document.querySelector(
    'chat-window infinite-scroller',
  ) as HTMLElement | null;
}
