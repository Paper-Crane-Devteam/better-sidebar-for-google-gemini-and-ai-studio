import { useMemo } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import type { Conversation } from '@/shared/lib/store/types';
import { scoreMatch } from '../lib/match';
import { buildSnippet, highlightSegments } from '../lib/highlight';
import { openChat } from '../lib/navigate';
import type { CommandItem, HighlightSegment } from '../types';

/** How many chats the palette offers before the user types anything. */
const RECENT_LIMIT = 5;
/** Cap on matched chat rows once a query narrows things down. */
const CONVERSATION_LIMIT = 12;

/**
 * Relative worth of a hit per field. A title hit is what the user meant; a tag
 * hit is a hint that happens to be attached to the chat.
 */
const WEIGHT = { title: 1, description: 0.6, tag: 0.5 } as const;

/** Business timestamp if we have one, falling back to the row's mtime. */
function activityTime(conversation: Conversation): number {
  return conversation.last_active_at ?? conversation.updated_at ?? 0;
}

export interface ConversationItems {
  /** The "I was just here" shortlist, shown only while the query is empty. */
  recentItems: CommandItem[];
  /** Chats whose title, description or tags matched the query. */
  matchedItems: CommandItem[];
  /**
   * Ids covered by `matchedItems`. Message hits for these chats are suppressed:
   * the chat is already in the list with a visible reason, and repeating it lower
   * down with a body excerpt reads like a duplicate.
   */
  listedConversationIds: Set<string>;
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

  /**
   * conversation id → its tag names. Kept as a list rather than one joined
   * string so a row can name the tag it matched on.
   */
  const tagNamesByConversation = useMemo(() => {
    const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
    const map = new Map<string, string[]>();
    for (const link of conversationTags) {
      const name = tagNameById.get(link.tag_id);
      if (!name) continue;
      const existing = map.get(link.conversation_id);
      if (existing) existing.push(name);
      else map.set(link.conversation_id, [name]);
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
      keywords: tagNamesByConversation.get(conversation.id)?.join(' ') ?? null,
      run: () =>
        openChat({
          id: conversation.id,
          conversation_id: conversation.id,
          external_url: conversation.external_url,
          platform: conversation.platform,
        }),
    }));
  }, [sortedConversations, query, folderNameById, tagNamesByConversation, t]);

  const { matchedItems, listedConversationIds } = useMemo(() => {
    if (!query) return { matchedItems: [], listedConversationIds: new Set<string>() };

    const scored: { id: string; item: CommandItem; score: number }[] = [];

    for (const conversation of sortedConversations) {
      const label = conversation.title || t('common.untitled');
      const tagNames = tagNamesByConversation.get(conversation.id) ?? [];

      // Scored per field rather than "best of all fields", because the row has to
      // say *which* field matched — a title with no highlight and no second line
      // is a result the user cannot account for.
      const titleScore = scoreMatch(label, query);
      const descriptionScore = conversation.description
        ? scoreMatch(conversation.description, query)
        : null;
      const matchedTag = tagNames.find((name) => scoreMatch(name, query) !== null);
      const tagScore = matchedTag ? scoreMatch(matchedTag, query) : null;

      const score = Math.max(
        titleScore === null ? -1 : titleScore * WEIGHT.title,
        descriptionScore === null ? -1 : descriptionScore * WEIGHT.description,
        tagScore === null ? -1 : tagScore * WEIGHT.tag,
      );
      if (score < 0) continue;

      /**
       * The match's evidence. A title hit needs none beyond its own highlight;
       * anything else has to be shown, or the row looks arbitrary.
       */
      let snippet: HighlightSegment[] | null = null;
      if (titleScore === null) {
        if (descriptionScore !== null) {
          snippet = buildSnippet(conversation.description ?? '', query);
        } else if (matchedTag) {
          snippet = highlightSegments(`#${matchedTag}`, query);
        }
      }

      scored.push({
        score,
        id: conversation.id,
        item: {
          id: `conversations:${conversation.id}`,
          group: 'conversations',
          icon: null,
          label,
          labelSegments: titleScore === null ? null : highlightSegments(label, query),
          snippet,
          meta: conversation.folder_id
            ? (folderNameById.get(conversation.folder_id) ?? null)
            : null,
          keywords: tagNames.join(' ') || null,
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
    const shown = scored.slice(0, CONVERSATION_LIMIT);

    return {
      matchedItems: shown.map((entry) => entry.item),
      // Only the rows that actually made the cut suppress their message hits.
      // Suppressing every scored chat would make one pushed off by the cap vanish
      // from the palette twice over.
      listedConversationIds: new Set(shown.map((entry) => entry.id)),
    };
  }, [sortedConversations, query, folderNameById, tagNamesByConversation, t]);

  return { recentItems, matchedItems, listedConversationIds };
}
