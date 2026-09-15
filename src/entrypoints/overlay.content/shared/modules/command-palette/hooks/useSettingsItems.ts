import React, { useMemo } from 'react';
import {
  Bot,
  Database,
  Info,
  Keyboard,
  LayoutTemplate,
  Palette,
  Plug,
  Settings,
  Share2,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import type { SettingsSection } from '@/shared/lib/store/types';
import { detectPlatform, Platform } from '@/shared/types/platform';
import type { CommandItem } from '../types';

const h = React.createElement;

/** One row per settings pane, so the palette doubles as an index of that panel. */
export function useSettingsItems(): CommandItem[] {
  const { t } = useI18n();
  const platform = detectPlatform();

  return useMemo(() => {
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
}
