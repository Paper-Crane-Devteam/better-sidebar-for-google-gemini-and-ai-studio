/**
 * Serialises the writes that touch the same conversation row.
 *
 * Creating a chat from a folder produces two independent messages from the page,
 * in this order:
 *
 *  1. `SAVE_CONVERSATION` from the content script's PromptCreateScanner, which
 *     creates the row.
 *  2. `MOVE_CONVERSATION` from the overlay's ExplorerTab, which files it into the
 *     folder the user picked.
 *
 * Their order on the wire is already guaranteed — both listen for the same
 * `BETTER_SIDEBAR_PROMPT_CREATE` event in the same frame, and the scanner is
 * registered first on purpose. What was not guaranteed is the order they reach the
 * database: `handleMessage` is started concurrently for every message, so the two
 * handlers raced. SAVE has two lookups to get through before its INSERT (does the
 * row exist, what is the gem/notebook default folder) and MOVE has none, so MOVE
 * reliably ran its UPDATE against a row that did not exist yet. The UPDATE matched
 * nothing, SAVE then inserted the row with the Inbox it had resolved, and the chat
 * appeared in the Inbox instead of the folder the user clicked from.
 *
 * Keyed per conversation, so writes to unrelated chats still overlap.
 */
const chains = new Map<string, Promise<void>>();

export function withConversationLock<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(id) ?? Promise.resolve();

  const result = previous.then(fn);

  // The chain the next caller waits on never rejects: one failed write must not
  // cancel everything queued behind it.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  chains.set(id, tail);

  // Drop the key once this is the last write in the chain, so the map does not
  // grow for the lifetime of the service worker.
  tail.then(() => {
    if (chains.get(id) === tail) chains.delete(id);
  });

  return result;
}
