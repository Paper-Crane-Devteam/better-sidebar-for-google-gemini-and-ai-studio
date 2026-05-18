/**
 * AI Studio platform theme adapter (placeholder).
 *
 * AI Studio uses different CSS variable naming (--color-v3-*).
 * This will be implemented when AI Studio theme support is added.
 */

import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Initialize theme sync for AI Studio.
 * Currently a no-op placeholder.
 */
export function initAiStudioThemeSync(): () => void {
  // TODO: Implement AI Studio theme variable mapping
  // AI Studio uses --color-v3-* variables (see doc/theme.main.css)
  return () => {};
}
