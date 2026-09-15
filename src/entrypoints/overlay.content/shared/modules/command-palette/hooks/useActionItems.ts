import React, { useMemo } from 'react';
import { List, Moon, PanelLeft, PanelLeftClose, SquarePen } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useHotkeyStore, HotkeyActionId } from '@/shared/lib/hotkey-store';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { toggleCompactMode } from '@/shared/lib/compact-mode';
import { detectPlatform, Platform } from '@/shared/types/platform';
import type { CommandItem } from '../types';

const h = React.createElement;

/**
 * The palette's quick actions.
 *
 * Rows state what they do, not what the setting currently is. A toggle read out
 * as "Currently ON" makes the user parse a sentence to work out what pressing
 * Enter will do, and the answer is always the same: flip it. The current state is
 * visible on the page itself.
 */
export function useActionItems(): CommandItem[] {
  const { t } = useI18n();

  const viewMode = useAppStore((s) => s.ui.explorer.viewMode);
  const compactMode = useSettingsStore((s) => s.compactMode);
  const bindings = useHotkeyStore((s) => s.bindings);
  const zenMode = usePegasusStore((s) => s.enhancedFeatures.gemini.zenMode);

  const platform = detectPlatform();

  return useMemo(() => {
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
      // The glyph still tracks the state — it is a picture, not a sentence, and
      // it costs nothing to read.
      icon: h(compactMode ? PanelLeft : PanelLeftClose, { className: 'h-4 w-4' }),
      group: 'actions',
      label: t('commandPalette.toggleCompactMode'),
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
}
