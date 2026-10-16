import { useMemo } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { buildSnippet } from '../lib/highlight';
import { openChat } from '../lib/navigate';
import type { MessageHit } from './useMessageSearch';
import type { CommandItem } from '../types';

/** Message rows the palette shows. Small on purpose: this is not the Search tab. */
const MESSAGE_LIMIT = 8;

/**
 * Turns raw message hits into rows: the chat's title, with the matching excerpt
 * as a small second line.
 *
 * One row per chat. Hits arrive newest-first, so the first one wins — showing
 * five rows with the same title and five different excerpts would spend the whole
 * list on a single conversation.
 */
export function useMessageItems(
  hits: MessageHit[],
  query: string,
  excludedConversationIds: Set<string>,
): CommandItem[] {
  const { t } = useI18n();

  return useMemo(() => {
    if (!query) return [];

    const items: CommandItem[] = [];
    const seen = new Set<string>();

    for (const hit of hits) {
      if (items.length >= MESSAGE_LIMIT) break;
      if (excludedConversationIds.has(hit.conversation_id)) continue;
      if (seen.has(hit.conversation_id)) continue;
      seen.add(hit.conversation_id);

      const snippet = buildSnippet(hit.content ?? '', query);
      if (!snippet) continue;

      items.push({
        id: `message:${hit.conversation_id}:${hit.id}`,
        group: 'messages',
        icon: null,
        label: hit.conversation_title || t('common.untitled'),
        snippet,
        meta: hit.folder_name ?? null,
        run: () =>
          openChat({
            id: hit.id,
            conversation_id: hit.conversation_id,
            external_url: hit.external_url,
            platform: hit.platform,
            scroll_index: hit.scroll_index,
            highlight: { query },
          }),
      });
    }

    return items;
  }, [hits, query, excludedConversationIds, t]);
}
