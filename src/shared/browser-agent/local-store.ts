/**
 * Where Browser Agent keeps its three kinds of state — none of which is a database of
 * its own any more.
 *
 * The first version opened `browser-agent-local-v1`, a hand-rolled IndexedDB, for all
 * three. That bought isolation from `execute_sql` and cost a second storage engine with
 * no migrations, no retention and whole-batch rewrites. The isolation was defending
 * against the agent deleting its own audit trail, which is not a thing it has any reason
 * to do. So each kind of state now lives wherever its lifetime already is:
 *
 * | state | home | why there |
 * |---|---|---|
 * | settings | `chrome.storage.local` | a Chrome-profile fact, and readable from the permission window, which has no tab and therefore no profile database |
 * | tab labels | `chrome.storage.session` | scoped to one browser session *by construction* — exactly the rule the labels needed, previously kept by hand with an epoch key per session that was never cleaned up |
 * | audit journal | the profile's SQLite | see `operations/browserAgent.ts` |
 *
 * ⚠️ The journal is now in the database the rest of the extension uses, which means a
 * **local full-database export carries it**. It is still absent from `SYNC_TABLES`, so
 * it does not travel to Drive.
 */
import { browserAuditRepo } from '@/shared/db/operations';
import type { BrowserSettings } from './contracts';
import { DEFAULT_SETTINGS } from './contracts';

const SETTINGS_KEY = 'browser-agent-settings';
const LABELS_KEY = 'browser-agent-tab-labels';

export const localAudit = {
  settings: async (): Promise<BrowserSettings> => {
    const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    // Merged rather than trusted: a record written by an older build can be missing a
    // field, and a missing capability list must read as "nothing granted", not undefined.
    return stored && typeof stored === 'object'
      ? { ...structuredClone(DEFAULT_SETTINGS), ...(stored as BrowserSettings) }
      : structuredClone(DEFAULT_SETTINGS);
  },
  saveSettings: (settings: BrowserSettings) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }),

  /**
   * Extension-only notes on tabs, keyed by tab id.
   *
   * No epoch parameter: `storage.session` is emptied when the browser closes, which is
   * the same boundary tab ids stop meaning anything at. Keying by epoch inside a
   * persistent store meant maintaining that rule ourselves, and leaving one dead record
   * behind per browser restart, forever.
   */
  labels: async (): Promise<Record<string, string>> =>
    (await chrome.storage.session.get(LABELS_KEY))[LABELS_KEY] as Record<string, string> ?? {},
  saveLabels: (labels: Record<string, string>) => chrome.storage.session.set({ [LABELS_KEY]: labels }),

  ...browserAuditRepo,
};
