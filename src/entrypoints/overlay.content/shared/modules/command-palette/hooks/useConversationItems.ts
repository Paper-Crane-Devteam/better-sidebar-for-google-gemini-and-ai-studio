import { useMemo } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import type { Conversation } from '@/shared/lib/store/types';
import { scoreFields } from '../lib/match';
import { highlightSegments } from '../lib/highlight';
import { openChat } from '../lib/navigate';
import type { CommandItem } from '../types';

/** How many chats the palette offers before the user types anything. */
const RECENT_LIMIT = 5;
/** Cap on title-matched chat rows once a query narrows things down. */
const CONVERSATION_LIMIT = 12;

/** Business timestamp if we have one, falling back to the row's mtime. */
function activityTime(conversation: Conversation): number {
  return conversation.last_active_at ?? conversation.updated_at ?? 0;
}

export interface ConversationItems {
  /** The "I was just here" shortlist, shown only while the query is empty. */
  recentItems: CommandItem[];
  /** Chats whose title, description or tags matched the query. */
  titleItems: CommandItem[];
  /**
   * Ids covered by `titleItems`. Message hits for these chats are suppressed:
   * a title match already answers the query, and a body excerpt underneath it
   * would just be a second, weaker reason for a row that is already there.
   */
  titleMatchedIds: Set<string>;
}

/**
 * Chat rows, built entirely from stores that are already in memory — filtering
 * is a synchronous pass over arrays, so these results land on the same frame as
 * the keystroke. Message bodies are not here; see `useMessageItems`.
 */
export function useConversationItems(query: string): ConversationItems {
  const { t } = useI18n();

  const conversations = useAppStore((s) => s.conversations);
  const folders = useAppStore((s) => s.folders);
  const tags = useAppStore((s) => s.tags);
  const conversationTags = useAppStore((s) => s.conversationTags);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) map.set(folder.id, folder.name);
    return map;
  }, [folders]);

  /** conversation id → its tag names, joined for search and display. */
  const tagNamesByConversation = useMemo(() => {
    const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
    const map = new Map<string, string>();
    for (const link of conversationTags) {
      const name = tagNameById.get(link.tag_id);
      if (!name) continue;
      const existing = map.get(link.conversation_id);
      map.set(link.conversation_id, existing ? `${existing} ${name}` : name);
    }
    return map;
  }, [tags, conversationTags]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => activityTime(b) - activityTime(a)),
    [conversations],
  );

  const recentItems = useMemo(() => {
    if (query) return [];
    return sortedConversations.slice(0, RECENT_LIMIT).map<CommandItem>((conversation) => ({
      id: `recent:${conversation.id}`,
      group: 'recent',
      // No glyph, but the slot stays: see `CommandItem.icon`.
      icon: null,
      label: conversation.title || t('common.untitled'),
      description: conversation.description || null,
      meta: conversation.folder_id
        ? (folderNameById.get(conversation.folder_id) ?? null)
        : null,
      keywords: tagNamesByConversation.get(conversation.id) ?? null,
      run: () =>
        openChat({
          id: conversation.id,
          conversation_id: conversation.id,
          external_url: conversation.external_url,
          platform: conversation.platform,
        }),
    }));
  }, [sortedConversations, query, folderNameById, tagNamesByConversation, t]);

  const { titleItems, titleMatchedIds } = useMemo(() => {
    if (!query) return { titleItems: [], titleMatchedIds: new Set<string>() };

    const scored: { item: CommandItem; score: number }[] = [];
    const matchedIds = new Set<string>();

    for (const conversation of sortedConversations) {
      const score = scoreFields(
        [
          { text: conversation.title, weight: 1 },
          { text: conversation.description, weight: 0.6 },
          { text: tagNamesByConversation.get(conversation.id), weight: 0.5 },
        ],
        query,
      );
      if (score === null) continue;

      // Every scored chat suppresses its message rows, not just the ones that
      // survive the cap: a chat pushed off the title list reappearing lower down
      // as a message hit reads like a duplicate.
      matchedIds.add(conversation.id);

      const label = conversation.title || t('common.untitled');
      scored.push({
        score,
        item: {
          id: `conversations:${conversation.id}`,
          group: 'conversations',
          icon: null,
          label,
          labelSegments: highlightSegments(label, query),
          // Deliberately no description: the title is the whole reason this row
          // is here, and a second line would compete with the message rows below
          // where a second line actually carries the match.
          meta: conversation.folder_id
            ? (folderNameById.get(conversation.folder_id) ?? null)
            : null,
          keywords: tagNamesByConversation.get(conversation.id) ?? null,
          run: () =>
            openChat({
              id: conversation.id,
              conversation_id: conversation.id,
              external_url: conversation.external_url,
              platform: conversation.platform,
            }),
        },
      });
    }

    // Recency is already the array order, so a stable sort on score alone keeps
    // "most recent wins" as the tiebreaker between equally good matches.
    scored.sort((a, b) => b.score - a.score);

    return {
      titleItems: scored.slice(0, CONVERSATION_LIMIT).map((entry) => entry.item),
      titleMatchedIds: matchedIds,
    };
  }, [sortedConversations, query, folderNameById, tagNamesByConversation, t]);

  return { recentItems, titleItems, titleMatchedIds };
}
