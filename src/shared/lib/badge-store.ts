import { useCallback } from 'react';
import { create } from 'zustand';

/**
 * Generic "red dot" badge system for feature-discovery hints.
 *
 * Every badge is a string key registered in BADGE_REGISTRY together with the
 * release that introduced it. The version is part of the dismissal record
 * (`key@version`), which gives each badge its own lifecycle:
 *
 * - Adding a key never resurrects dots the user already dismissed.
 * - Re-pointing an existing key at a newer version *does* bring its dot back,
 *   which is what you want when a section gets a visible revamp.
 * - Deleting a key retires that badge for good.
 *
 * ── Adding a badge ──────────────────────────────────────────────────────────
 * 1. Register the key below with the release it ships in.
 * 2. Render the dot. The parent needs `relative`:
 *      <FeatureBadge badgeKey="tab.agent" placement="icon" />
 *    …or for a text label, which brings its own `relative` wrapper:
 *      <BadgeLabel badgeKey="menu.compactMode">{t('menu.enterCompactMode')}</BadgeLabel>
 * 3. Dismiss it when the user acts on the thing:
 *      const agentBadge = useBadge('tab.agent');
 *      onClick={() => { agentBadge.dismiss(); openAgentTab(); }}
 *
 * Dotted keys form groups, so a parent entry point can aggregate its children:
 *   const hasAny = useBadgeGroup('settings.');   // gear icon dot
 */

// ─── Registry ────────────────────────────────────────────────────────────────
/** Badge key → the app version that introduced it. */
export const BADGE_REGISTRY: Record<string, string> = {
  // 2.10.0
  'settings.theme': '2.10.0',
  'tab.agent': '2.10.0',
  'menu.compactMode': '2.10.0',
};

/** Stable record used as the dismissal identity for a badge. */
const recordFor = (key: string): string | null => {
  const version = BADGE_REGISTRY[key];
  return version ? `${key}@${version}` : null;
};

// ─── Storage ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'badge_dismissed';

interface BadgeDismissedData {
  /** Entries shaped `${key}@${version}`. */
  dismissed: string[];
}

/**
 * Older builds stored `{ version, dismissed: [bareKey] }` with a single global
 * version for all badges. Stamp those bare keys with the version they were
 * dismissed under so they keep matching only badges still pinned to it.
 */
function normalizeDismissed(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as { version?: unknown; dismissed?: unknown };
  if (!Array.isArray(data.dismissed)) return [];
  const legacyVersion = typeof data.version === 'string' ? data.version : '';
  return data.dismissed
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) =>
      entry.includes('@') || !legacyVersion ? entry : `${entry}@${legacyVersion}`,
    );
}

async function loadDismissed(): Promise<string[]> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return normalizeDismissed(result[STORAGE_KEY]);
  } catch {
    return [];
  }
}

async function saveDismissed(dismissed: string[]): Promise<void> {
  try {
    const data: BadgeDismissedData = { dismissed };
    await browser.storage.local.set({ [STORAGE_KEY]: data });
  } catch (e) {
    console.error('[badge-store] Failed to save dismissed state', e);
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────
interface BadgeState {
  /** Dismissed `key@version` records */
  dismissed: Set<string>;
  /** Whether the store has finished loading from storage */
  ready: boolean;

  /** Check if a specific badge should be visible */
  isVisible: (key: string) => boolean;
  /** Check if ANY registered badge under one of these prefixes is visible */
  isGroupVisible: (prefix: string | string[]) => boolean;
  /** Dismiss a badge (user has acted on it) */
  dismiss: (key: string) => void;
  /** Dismiss every registered badge under a prefix */
  dismissGroup: (prefix: string) => void;
  /** Initialize from storage — call once on mount */
  init: () => Promise<void>;
}

export const useBadgeStore = create<BadgeState>((set, get) => ({
  dismissed: new Set(),
  ready: false,

  isVisible: (key: string) => {
    const { dismissed, ready } = get();
    if (!ready) return false;
    const record = recordFor(key);
    return !!record && !dismissed.has(record);
  },

  isGroupVisible: (prefix: string | string[]) => {
    const { dismissed, ready } = get();
    if (!ready) return false;
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    return Object.entries(BADGE_REGISTRY).some(
      ([key, version]) =>
        prefixes.some((p) => key.startsWith(p)) &&
        !dismissed.has(`${key}@${version}`),
    );
  },

  dismiss: (key: string) => {
    const record = recordFor(key);
    if (!record) return;
    const { dismissed } = get();
    if (dismissed.has(record)) return;
    const next = new Set(dismissed);
    next.add(record);
    set({ dismissed: next });
    saveDismissed([...next]);
  },

  dismissGroup: (prefix: string) => {
    const { dismissed } = get();
    const next = new Set(dismissed);
    for (const [key, version] of Object.entries(BADGE_REGISTRY)) {
      if (key.startsWith(prefix)) next.add(`${key}@${version}`);
    }
    if (next.size === dismissed.size) return;
    set({ dismissed: next });
    saveDismissed([...next]);
  },

  init: async () => {
    const dismissed = await loadDismissed();
    set({ dismissed: new Set(dismissed), ready: true });
  },
}));

// ─── Hooks ───────────────────────────────────────────────────────────────────
/**
 * Subscribe to a single badge.
 * `dismiss` is stable, so it is safe inside effects and memoized handlers.
 */
export function useBadge(key: string): { visible: boolean; dismiss: () => void } {
  const visible = useBadgeStore((s) => s.isVisible(key));
  const dismissKey = useBadgeStore((s) => s.dismiss);
  const dismiss = useCallback(() => dismissKey(key), [dismissKey, key]);
  return { visible, dismiss };
}

/**
 * Subscribe to a group of badges for a parent entry point (a gear icon, an
 * overflow menu trigger). Pass one prefix or several.
 */
export function useBadgeGroup(prefix: string | string[]): boolean {
  const key = Array.isArray(prefix) ? prefix.join('|') : prefix;
  return useBadgeStore((s) => s.isGroupVisible(key.split('|')));
}
