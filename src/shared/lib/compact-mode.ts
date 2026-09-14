import i18n from '@/locale/i18n';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useBadgeStore } from '@/shared/lib/badge-store';
import { toast } from '@/shared/lib/toast';

interface ToggleCompactModeOptions {
  /**
   * Point out the Library-title shortcut the first time compact mode is turned
   * on. Only meaningful for entry points that don't teach it themselves — the
   * title button already is the shortcut, so it passes this as false.
   */
  hintTitleShortcut?: boolean;
}

/**
 * Toggle compact mode from any entry point (Library title, overflow menu).
 *
 * Both entry points share the same side effects: the "new" dot retires because
 * the user has clearly found the feature, and entering compact mode forces the
 * Library tab since the tab bar is about to disappear.
 */
export function toggleCompactMode(options: ToggleCompactModeOptions = {}) {
  const {
    compactMode,
    setCompactMode,
    compactModeHintShown,
    setCompactModeHintShown,
  } = useSettingsStore.getState();

  useBadgeStore.getState().dismiss('menu.compactMode');

  const next = !compactMode;
  if (next) useAppStore.getState().setActiveTab('files');
  setCompactMode(next);

  if (next && options.hintTitleShortcut && !compactModeHintShown) {
    setCompactModeHintShown(true);
    toast.info(i18n.t('toast.compactModeTitleHint'), 6000);
  }
}
