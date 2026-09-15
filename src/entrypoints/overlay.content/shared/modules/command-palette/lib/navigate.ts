import { handleSearchNavigation } from '../../../utils';

interface ChatTarget {
  /** Message id when the row came from a message hit, chat id otherwise. */
  id: string;
  conversation_id: string;
  external_url?: string;
  platform?: string;
  scroll_index?: number;
}

/**
 * Opens a chat, optionally scrolled to a message.
 *
 * Reuses the Search tab's navigator rather than calling `navigateToConversation`
 * directly: it already knows to open another platform's chat in a new tab, and
 * to wait for AI Studio's editor before scrolling.
 */
export function openChat(target: ChatTarget): void {
  handleSearchNavigation(target).catch((e) =>
    console.error('Better Sidebar: command palette navigation failed', e),
  );
}
