/**
 * Local Power Pack trial and the "your trial ended" prompt bookkeeping.
 *
 * Every install (new or updated) gets LOCAL_TRIAL_DAYS of Power Pack, counted
 * from the first time an overlay page runs this version. It never talks to the
 * license server: no KV cost, and reinstalling to get another 3 days is not
 * worth defending against.
 *
 * Paid Power Pack users also get a start time recorded; it is simply never
 * surfaced to them, since their license already covers everything.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

export const LOCAL_TRIAL_DAYS = 3;
const LOCAL_TRIAL_MS = LOCAL_TRIAL_DAYS * 24 * 60 * 60 * 1000;

export const TRIAL_STORAGE_KEY = 'better-sidebar-trial';

/** Prompt id for the local trial; time-limited codes use their token. */
export const LOCAL_TRIAL_PROMPT_ID = 'local';

export interface TrialState {
  /** When the local trial started (ms). Null until the first overlay run. */
  localTrialStartedAt: number | null;
  /** Trials whose "trial ended" prompt has been shown: 'local' or a code token. */
  endPromptsShown: string[];

  startLocalTrial: () => void;
  markEndPromptsShown: (ids: string[]) => void;
}

const storage: StateStorage = {
  getItem: async (name) => {
    try {
      const result = await browser?.storage?.local?.get(name);
      return (result?.[name] as string) || null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await browser.storage.local.set({ [name]: value });
    } catch {
      // silent
    }
  },
  removeItem: async (name) => {
    try {
      await browser.storage.local.remove(name);
    } catch {
      // silent
    }
  },
};

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      localTrialStartedAt: null,
      endPromptsShown: [],

      startLocalTrial: () => {
        if (get().localTrialStartedAt) return;
        set({ localTrialStartedAt: Date.now() });
      },

      markEndPromptsShown: (ids) => {
        const shown = new Set(get().endPromptsShown);
        ids.forEach((id) => shown.add(id));
        set({ endPromptsShown: [...shown] });
      },
    }),
    {
      name: TRIAL_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      version: 1,
    },
  ),
);

/** End of the local trial (ms), or null if it hasn't started. */
export function localTrialEndsAt(state: Pick<TrialState, 'localTrialStartedAt'>): number | null {
  return state.localTrialStartedAt ? state.localTrialStartedAt + LOCAL_TRIAL_MS : null;
}

/** True while the local trial is running. */
export function isLocalTrialActive(
  state: Pick<TrialState, 'localTrialStartedAt'> = useTrialStore.getState(),
): boolean {
  const endsAt = localTrialEndsAt(state);
  return !!endsAt && Date.now() < endsAt;
}

interface PersistedStore {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
}

/** Wait until a persisted zustand store has loaded from storage (5s cap). */
export async function waitForStoreHydration(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
    setTimeout(resolve, 5000);
  });
}

/**
 * Start the local trial if it hasn't started yet. Call from page contexts.
 *
 * Waits for hydration first: setting state before the stored value loads would
 * overwrite an earlier start time and hand out a fresh trial.
 */
export async function ensureLocalTrialStarted(): Promise<void> {
  try {
    await waitForStoreHydration(useTrialStore);
    if (!useTrialStore.persist.hasHydrated()) return;
    useTrialStore.getState().startLocalTrial();
  } catch (err) {
    console.error('[Trial] Could not start the local trial:', err);
  }
}

// Keep every extension context in step (same pattern as the license store).
if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[TRIAL_STORAGE_KEY]) return;
    void useTrialStore.persist.rehydrate();
  });
}
