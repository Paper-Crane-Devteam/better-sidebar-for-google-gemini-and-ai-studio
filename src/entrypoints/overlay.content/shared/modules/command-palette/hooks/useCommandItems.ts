import { useMemo } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { scoreFields } from '../lib/match';
import { highlightSegments } from '../lib/highlight';
import { useConversationItems } from './useConversationItems';
import { useMessageSearch } from './useMessageSearch';
import { useMessageItems } from './useMessageItems';
import { useActionItems } from './useActionItems';
import { useSettingsItems } from './useSettingsItems';
import type { CommandGroup, CommandItem } from '../types';

/**
 * Assembles the palette's groups for a given query.
 *
 * Reading order is deliberate: chats the query names, then chats whose messages
 * mention it, then commands. Someone typing into the palette is usually trying to
 * get back to a conversation, and commands are the fallback rather than the point.
 *
 * Everything but the message group is synchronous, so the list is never empty
 * while the user waits — the excerpt rows just fill in a beat later.
 */
export function useCommandItems(query: string): CommandGroup[] {
  const { t } = useI18n();
  const trimmed = query.trim();

  const { recentItems, titleItems, titleMatchedIds } = useConversationItems(trimmed);
  const { hits, isSearching } = useMessageSearch(trimmed);
  const messageItems = useMessageItems(hits, trimmed, titleMatchedIds);
  const actionItems = useActionItems();
  const settingsItems = useSettingsItems();

  /**
   * Commands are ranked on their own text. Highlighting is applied to the label
   * afterwards so a match is visible even when it landed on a hidden alias.
   */
  const filterCommands = (items: CommandItem[]): CommandItem[] => {
    if (!trimmed) return items;

    const scored: { item: CommandItem; score: number }[] = [];
    for (const item of items) {
      const score = scoreFields(
        [
          { text: item.label, weight: 1 },
          { text: item.meta, weight: 0.4 },
          { text: item.keywords, weight: 0.7 },
        ],
        trimmed,
      );
      if (score === null) continue;
      scored.push({
        score,
        item: { ...item, labelSegments: highlightSegments(item.label, trimmed) },
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  };

  return useMemo(() => {
    const groups: CommandGroup[] = [
      { id: 'recent', label: t('commandPalette.groupRecent'), items: recentItems },
      {
        id: 'conversations',
        label: t('commandPalette.groupConversations'),
        items: titleItems,
      },
      {
        id: 'messages',
        label: t('commandPalette.groupMessages'),
        items: messageItems,
        isLoading: isSearching,
      },
      {
        id: 'actions',
        label: t('commandPalette.groupActions'),
        items: filterCommands(actionItems),
      },
      {
        id: 'settings',
        label: t('commandPalette.groupSettings'),
        items: filterCommands(settingsItems),
      },
    ];
    // An empty group is dropped unless it is still loading, in which case it
    // stays to hold the "searching" line.
    return groups.filter((group) => group.items.length > 0 || group.isLoading);
  }, [
    recentItems,
    titleItems,
    messageItems,
    isSearching,
    actionItems,
    settingsItems,
    trimmed,
    t,
  ]);
}
