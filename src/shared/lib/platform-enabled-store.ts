// Platform enable/disable store
// Uses chrome.storage.local directly (not per-platform storage)
// This is a global setting that controls whether the extension runs on each platform

import { Platform } from '../types/platform';

const STORAGE_KEY = 'better-sidebar-platform-enabled';

export interface PlatformEnabledState {
  [Platform.AI_STUDIO]: boolean;
  [Platform.GEMINI]: boolean;
  [Platform.CHATGPT]: boolean;
  [Platform.CLAUDE]: boolean;
}

const DEFAULT_STATE: PlatformEnabledState = {
  [Platform.AI_STUDIO]: true,
  [Platform.GEMINI]: true,
  [Platform.CHATGPT]: true,
  [Platform.CLAUDE]: true,
};

/**
 * Get the enabled state for all platforms
 */
export async function getPlatformEnabledState(): Promise<PlatformEnabledState> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as string | undefined;
    if (stored) {
      // Merge with defaults to handle newly added platforms
      return { ...DEFAULT_STATE, ...JSON.parse(stored as string) };
    }
    return { ...DEFAULT_STATE };
  } catch (e) {
    console.error('Error reading platform enabled state:', e);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Check if a specific platform is enabled
 */
export async function isPlatformEnabled(platform: Platform): Promise<boolean> {
  if (platform === Platform.UNKNOWN) return false;
  const state = await getPlatformEnabledState();
  return state[platform as keyof PlatformEnabledState] ?? true;
}

/**
 * Set the enabled state for a specific platform
 */
export async function setPlatformEnabled(
  platform: Platform,
  enabled: boolean,
): Promise<void> {
  try {
    const state = await getPlatformEnabledState();
    state[platform as keyof PlatformEnabledState] = enabled;
    await browser.storage.local.set({
      [STORAGE_KEY]: JSON.stringify(state),
    });
  } catch (e) {
    console.error('Error writing platform enabled state:', e);
  }
}

/**
 * Set the enabled state for all platforms at once
 */
export async function setAllPlatformEnabled(
  state: PlatformEnabledState,
): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEY]: JSON.stringify(state),
    });
  } catch (e) {
    console.error('Error writing platform enabled state:', e);
  }
}
