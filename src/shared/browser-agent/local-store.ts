/**
 * Where Browser Agent keeps its state — neither kind in a database of its own any more.
 *
 * The first version opened `browser-agent-local-v1`, a hand-rolled IndexedDB. That
 * bought isolation from `execute_sql` and cost a second storage engine with no
 * migrations, no retention and whole-batch rewrites. The isolation was defending against
 * the agent deleting its own audit trail, which is not a thing it has any reason to do.
 * So each kind of state now lives wherever its lifetime already is:
 *
 * | state | home | why there |
 * |---|---|---|
 * | settings | `chrome.storage.local` | a Chrome-profile fact, and readable from the permission window, which has no tab and therefore no profile database |
 * | audit journal | the profile's SQLite | see `operations/browserAgent.ts` |
 *
 * ⚠️ The journal is now in the database the rest of the extension uses, which means a
 * **local full-database export carries it**. It is still absent from `SYNC_TABLES`, so
 * it does not travel to Drive.
 *
 * ⚠️ There was a third kind: per-tab notes in `chrome.storage.session`. The note
 * operation is gone (§1) — a label that expires with the browser session is missing
 * exactly when someone would look for it — so the store went with it.
 */
import { browserAuditRepo } from '@/shared/db/operations';
import type { BrowserSettings, Capability } from './contracts';
import { CAPABILITIES, DEFAULT_SETTINGS } from './contracts';

const SETTINGS_KEY = 'browser-agent-settings';

export const localAudit = {
  settings: async (): Promise<BrowserSettings> => {
    const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    // Merged rather than trusted: a record written by an older build can be missing a
    // field, and a missing capability list must read as "nothing granted", not undefined.
    if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_SETTINGS);
    const merged = { ...structuredClone(DEFAULT_SETTINGS), ...(stored as BrowserSettings) };
    // ⚠️ And names are checked, not just presence. A capability that was renamed between
    // builds (`bookmarks.write` → `arrange`/`delete`) otherwise survives here forever and
    // poisons the *whole* settings object: the window loads it into its form state, every
    // toggle sends it back, and `configure` rejects the batch as invalid — so all eight
    // switches silently snap back and nothing can be changed again. Dropping an unknown
    // name reads as "that capability is off", which is the safe direction, and the next
    // save writes the cleaned list back.
    return {
      ...merged,
      capabilities: (Array.isArray(merged.capabilities) ? merged.capabilities : [])
        .filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(c)),
    };
  },
  saveSettings: (settings: BrowserSettings) => chrome.storage.local.set({ [SETTINGS_KEY]: settings }),

  ...browserAuditRepo,
};
