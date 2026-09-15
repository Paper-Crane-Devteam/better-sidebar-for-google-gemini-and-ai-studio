import React, { useMemo } from 'react';
import {
  Bot,
  Database,
  Image as ImageIcon,
  Info,
  Keyboard,
  LayoutTemplate,
  List,
  MessageSquare,
  Moon,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plug,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  SquarePen,
  Trophy,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useHotkeyStore, HotkeyActionId } from '@/shared/lib/hotkey-store';
import type { Conversation, SettingsSection } from '@/shared/lib/store/types';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { toggleCompactMode } from '@/shared/lib/compact-mode';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { handleSearchNavigation } from '../../utils';
import { scoreFields } from './match';
import type { CommandGroup, CommandGroupId, CommandItem } from './types';

/** How many chats the palette offers before the user types anything. */
const RECENT_LIMIT = 5;
/** Cap on chat rows once a query narrows things down. */
const CONVERSATION_LIMIT = 20;

const h = React.createElement;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Business timestamp if we have one, falling back to the row's mtime. */
function activityTime(conversation: Conversation): number {
  return conversation.last_active_at ?? conversation.updated_at ?? 0;
}

function conversationIcon(conversation: Conversation) {
  switch (conversation.type) {
    case 'text-to-image':
      return h(ImageIcon, { className: 'h-4 w-4' });
    case 'gem':
      return h(UIcon, { icon: 'tabler:diamond', className: 'h-4 w-4' });
    case 'notebook':
      return h(UIcon, { icon: 'tabler:notebook', className: 'h-4 w-4' });
    default:
      return h(MessageSquare, { className: 'h-4 w-4' });
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Builds the palette's groups for a given query.
 *
 * Everything comes out of stores that are already in memory, so filtering is a
 * synchronous pass over arrays — no DB round-trip, and results update as fast
 * as the user types. Message *content* is not searched here; that is what the
 * Search tab is for, and the palette links to it via its own command.
 */
export function useCommandItems(query: string): CommandGroup[] {
  const { t } = useI18n();

  const conversations = useAppStore((s) => s.conversations);
  const folders = useAppStore((s) => s.folders);
  const tags = useAppStore((s) => s.tags);
  const conversationTags = useAppStore((s) => s.conversationTags);
  const viewMode = useAppStore((s) => s.ui.explorer.viewMode);

  const compactMode = useSettingsStore((s) => s.compactMode);
  const bindings = useHotkeyStore((s) => s.bindings);
  const zenMode = usePegasusStore((s) => s.enhancedFeatures.gemini.zenMode);

  const platform = detectPlatform();
  const trimmed = query.trim();

  // ── Lookup tables ─────────────────────────────────────────────────────
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

  // ── Chat rows ─────────────────────────────────────────────────────────
  const toConversationItem = (
    conversation: Conversation,
    group: CommandGroupId,
    keys?: string | null,
  ): CommandItem => ({
    id: `${group}:${conversation.id}`,
    group,
    icon: conversationIcon(conversation),
    label: conversation.title || t('common.untitled'),
    description: conversation.description || null,
    meta: conversation.folder_id
      ? (folderNameById.get(conversation.folder_id) ?? null)
      : null,
    keys: keys ?? null,
    keywords: tagNamesByConversation.get(conversation.id) ?? null,
    run: () => {
      // Reuses the Search tab's navigator rather than calling
      // `navigateToConversation` directly: it already knows to open another
      // platform's chat in a new tab, and to wait for AI Studio's editor.
      handleSearchNavigation({
        id: conversation.id,
        conversation_id: conversation.id,
        external_url: conversation.external_url,
        platform: conversation.platform,
      }).catch((e) =>
        console.error('Better Sidebar: command palette navigation failed', e),
      );
    },
  });

  /**
   * Recent chats only make sense as an "I was just here" shortlist, so they are
   * dropped the moment a query exists — otherwise the same rows would appear
   * twice, once here and once in the ranked chat list.
   */
  const recentItems = useMemo(() => {
    if (trimmed) return [];
    return sortedConversations.slice(0, RECENT_LIMIT).map((conversation, i) =>
      // A palette-local shortcut, not a registered hotkey: ⌥1…⌥5 jump straight to
      // a row without arrowing down to it. Alt rather than Ctrl/⌘ because the
      // browser owns Ctrl/⌘+digit for tab switching and will not release it.
      toConversationItem(conversation, 'recent', `Alt+${i + 1}`),
    );
  }, [sortedConversations, trimmed, folderNameById, tagNamesByConversation, t]);

  const conversationItems = useMemo(() => {
    if (!trimmed) return [];
    const scored: { item: CommandItem; score: number }[] = [];

    for (const conversation of sortedConversations) {
      const score = scoreFields(
        [
          { text: conversation.title, weight: 1 },
          { text: conversation.description, weight: 0.6 },
          { text: tagNamesByConversation.get(conversation.id), weight: 0.5 },
        ],
        trimmed,
      );
      if (score === null) continue;
      scored.push({ item: toConversationItem(conversation, 'conversations'), score });
    }

    // Recency is already the array order, so a stable sort on score alone keeps
    // "most recent wins" as the tiebreaker between equally good matches.
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, CONVERSATION_LIMIT).map((entry) => entry.item);
  }, [sortedConversations, trimmed, folderNameById, tagNamesByConversation, t]);

  /**
   * Hand-off to the Search tab.
   *
   * The palette matches chat titles, descriptions and tags — all of which live
   * in memory. Message bodies do not, and full-text search over them is a DB
   * query with its own filters and result UI. Rather than reimplement a worse
   * version of that inline, the palette offers to take the query there.
   */
  const searchBridgeItem = useMemo<CommandItem | null>(() => {
    if (!trimmed) return null;
    return {
      id: 'action:searchMessages',
      group: 'actions',
      icon: h(Search, { className: 'h-4 w-4' }),
      label: t('commandPalette.searchMessages', { query: trimmed }),
      description: t('commandPalette.searchMessagesHint'),
      run: () => {
        const store = useAppStore.getState();
        if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
        store.setActiveTab('search');
        store.setSearchQuery(trimmed);
        store.performGlobalSearch();
      },
    };
  }, [trimmed, t]);

  // ── Quick actions ─────────────────────────────────────────────────────
  const actionItems = useMemo(() => {
    const binding = (id: HotkeyActionId) => bindings[id] ?? null;
    const items: CommandItem[] = [];

    items.push({
      id: 'action:newChat',
      group: 'actions',
      icon: h(SquarePen, { className: 'h-4 w-4' }),
      label: t('hotkeys.newConversation'),
      keys: binding('newConversation'),
      // English aliases on top of the localised label, so the commands stay
      // findable for anyone who types English into a non-English UI.
      keywords: 'new chat conversation',
      run: () => navigateToNewChat(),
    });

    // Zen mode is a Gemini-only page treatment; there is nothing to hide on
    // AI Studio, so the command would be a dead end there.
    if (platform === Platform.GEMINI) {
      items.push({
        id: 'action:zenMode',
        group: 'actions',
        icon: h(Moon, { className: 'h-4 w-4' }),
        label: t('hotkeys.toggleZenMode'),
        description: zenMode
          ? t('commandPalette.stateOn')
          : t('commandPalette.stateOff'),
        keys: binding('toggleZenMode'),
        keywords: 'zen focus distraction free',
        run: () => {
          usePegasusStore.getState().setGeminiEnhancedFeature('zenMode', !zenMode);
        },
      });
    }

    items.push({
      id: 'action:viewMode',
      group: 'actions',
      icon: h(List, { className: 'h-4 w-4' }),
      label: t('hotkeys.toggleViewMode'),
      description:
        viewMode === 'tree'
          ? t('commandPalette.switchToTimeline')
          : t('commandPalette.switchToTree'),
      keys: binding('toggleViewMode'),
      keywords: 'tree timeline view layout',
      run: () => {
        useAppStore
          .getState()
          .setExplorerViewMode(viewMode === 'tree' ? 'timeline' : 'tree');
      },
    });

    items.push({
      id: 'action:compactMode',
      group: 'actions',
      icon: h(compactMode ? PanelLeft : PanelLeftClose, { className: 'h-4 w-4' }),
      label: t('commandPalette.toggleCompactMode'),
      description: compactMode
        ? t('commandPalette.stateOn')
        : t('commandPalette.stateOff'),
      keywords: 'compact density narrow',
      run: () => toggleCompactMode(),
    });

    items.push({
      id: 'action:originalSidebar',
      group: 'actions',
      icon: h(PanelLeftClose, { className: 'h-4 w-4' }),
      label: t('hotkeys.switchOriginalUI'),
      keys: binding('switchOriginalUI'),
      keywords: 'original native sidebar restore',
      run: () => {
        const store = useAppStore.getState();
        store.setOverlayOpen(!store.ui.overlay.isOpen);
      },
    });

    return items;
  }, [bindings, platform, zenMode, viewMode, compactMode, t]);

  // ── Settings sections ─────────────────────────────────────────────────
  const settingsItems = useMemo(() => {
    const hasPlatformSettings =
      platform === Platform.GEMINI || platform === Platform.AI_STUDIO;

    // Mirrors the SettingsModal sidebar, in the same order, so the palette is a
    // faithful index of that panel rather than a second opinion on it.
    const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
      { id: 'general', label: t('settings.general'), icon: h(Settings, { className: 'h-4 w-4' }) },
      { id: 'theme', label: t('themeSettings.title'), icon: h(Palette, { className: 'h-4 w-4' }) },
      { id: 'explorer', label: t('settings.library'), icon: h(LayoutTemplate, { className: 'h-4 w-4' }) },
      ...(hasPlatformSettings
        ? [{ id: 'platform' as SettingsSection, label: t('settings.uiControls'), icon: h(SlidersHorizontal, { className: 'h-4 w-4' }) }]
        : []),
      { id: 'data', label: t('settings.dataStorage'), icon: h(Database, { className: 'h-4 w-4' }) },
      { id: 'hotkeys', label: t('hotkeys.title'), icon: h(Keyboard, { className: 'h-4 w-4' }) },
      { id: 'integrations', label: t('integrations.title'), icon: h(Plug, { className: 'h-4 w-4' }) },
      { id: 'agent', label: 'Agent', icon: h(Bot, { className: 'h-4 w-4' }) },
      { id: 'supportpack', label: t('packs.title'), icon: h(Trophy, { className: 'h-4 w-4' }) },
      { id: 'sponsor', label: t('settings.sponsor'), icon: h(Share2, { className: 'h-4 w-4' }) },
      { id: 'about', label: t('settings.about'), icon: h(Info, { className: 'h-4 w-4' }) },
    ];

    return sections.map<CommandItem>((section) => ({
      id: `settings:${section.id}`,
      group: 'settings',
      icon: section.icon,
      label: section.label,
      // No `meta`: the group header already says "Settings", and repeating it on
      // every row is noise. The word stays searchable through `keywords`.
      keywords: `settings preferences options ${section.id}`,
      run: () => {
        useAppStore.getState().setSettingsOpen(true, section.id);
      },
    }));
  }, [platform, t]);

  // ── Filter the command-ish groups ─────────────────────────────────────
  const filterCommands = (items: CommandItem[]) => {
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
      scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  };

  return useMemo(() => {
    const groups: CommandGroup[] = [
      { id: 'recent', label: t('commandPalette.groupRecent'), items: recentItems },
      { id: 'conversations', label: t('commandPalette.groupConversations'), items: conversationItems },
      {
        id: 'actions',
        label: t('commandPalette.groupActions'),
        // The search hand-off is prepended rather than filtered: it is an offer
        // to look further, so it has to survive a query that matches nothing.
        items: [
          ...(searchBridgeItem ? [searchBridgeItem] : []),
          ...filterCommands(actionItems),
        ],
      },
      { id: 'settings', label: t('commandPalette.groupSettings'), items: filterCommands(settingsItems) },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [
    recentItems,
    conversationItems,
    searchBridgeItem,
    actionItems,
    settingsItems,
    trimmed,
    t,
  ]);
}
