import { create } from 'zustand';

/**
 * Generic "red dot" badge system for feature update notifications.
 *
 * How it works:
 * - Each badge has a unique key (e.g. 'settings.theme', 'settings.supportpack').
 * - A badge is "active" when the current version defines it AND the user hasn't dismissed it yet.
 * - Dismissal is persisted per-version in browser.storage.local.
 * - When you release a new version, just update BADGE_VERSION and ACTIVE_BADGES below.
 *
 * Adding a new badge in the future:
 * 1. Add the key string to ACTIVE_BADGES.
 * 2. Use `useBadgeStore(state => state.isVisible('your.key'))` in your component.
 * 3. Call `useBadgeStore.getState().dismiss('your.key')` when the user interacts.
 */

// ─── Configuration ───────────────────────────────────────────────────────────
// Bump this when you want badges to re-appear for a new release.
export const BADGE_VERSION = '2.5.1';

// Keys of badges that should show for this version.
export const ACTIVE_BADGES: string[] = [
  'settings.theme',
  'settings.supportpack',
  'settings.platform',
];

// ─── Storage ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'badge_dismissed';

interface BadgeDismissedData {
  version: string;
  dismissed: string[]; // list of dismissed badge keys
}

async function loadDismissed(): Promise<BadgeDismissedData> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY] as BadgeDismissedData | undefined;
    if (data && data.version === BADGE_VERSION) {
      return data;
    }
    // Version mismatch or no data — reset
    return { version: BADGE_VERSION, dismissed: [] };
  } catch {
    return { version: BADGE_VERSION, dismissed: [] };
  }
}

async function saveDismissed(dismissed: string[]): Promise<void> {
  try {
    const data: BadgeDismissedData = { version: BADGE_VERSION, dismissed };
    await browser.storage.local.set({ [STORAGE_KEY]: data });
  } catch (e) {
    console.error('[badge-store] Failed to save dismissed state', e);
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────
interface BadgeState {
  /** Set of badge keys that have been dismissed this version */
  dismissed: Set<string>;
  /** Whether the store has finished loading from storage */
  ready: boolean;

  /** Check if a specific badge should be visible */
  isVisible: (key: string) => boolean;
  /** Check if ANY badge in a group is visible (for parent indicators) */
  isGroupVisible: (prefix: string) => boolean;
  /** Dismiss a badge (user has seen it) */
  dismiss: (key: string) => void;
  /** Initialize from storage — call once on mount */
  init: () => Promise<void>;
}

export const useBadgeStore = create<BadgeState>((set, get) => ({
  dismissed: new Set(),
  ready: false,

  isVisible: (key: string) => {
    const { dismissed, ready } = get();
    if (!ready) return false;
    return ACTIVE_BADGES.includes(key) && !dismissed.has(key);
  },

  isGroupVisible: (prefix: string) => {
    const { dismissed, ready } = get();
    if (!ready) return false;
    return ACTIVE_BADGES.some(
      (key) => key.startsWith(prefix) && !dismissed.has(key),
    );
  },

  dismiss: (key: string) => {
    const { dismissed } = get();
    if (dismissed.has(key)) return;
    const next = new Set(dismissed);
    next.add(key);
    set({ dismissed: next });
    saveDismissed([...next]);
  },

  init: async () => {
    const data = await loadDismissed();
    set({ dismissed: new Set(data.dismissed), ready: true });
  },
}));
