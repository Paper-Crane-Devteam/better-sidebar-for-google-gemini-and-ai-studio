/**
 * License / Support Pack store.
 *
 * Manages the activation state for premium features (themes, agent loop, etc.)
 * Persisted in browser.storage.local, separate from settings to avoid
 * migration conflicts and keep concerns isolated.
 *
 * ## Validity model
 *
 * A license has two clocks:
 *
 * - `expiresAt` — the server-backed validation window (14 days). The background
 *   renewal job pushes this forward well before it runs out.
 * - `graceUntil` — a fallback window that only matters when renewal *couldn't
 *   reach the server*. Being offline, behind a firewall, or hitting a 5xx must
 *   never cost a paying user their license, so the entitlement keeps working
 *   while renewal retries.
 *
 * A license is only revoked locally when the server explicitly says the token is
 * no longer good (refund, chargeback, manual revoke). See `license-renewal.ts`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

/** License tier derived from token prefix */
export type LicenseTier = 'support_pack' | 'power_pack' | 'pro' | 'none';

/** Storage key for the persisted license state. */
export const LICENSE_STORAGE_KEY = 'better-sidebar-license';

/**
 * How long the entitlement survives after `expiresAt` when the server is
 * unreachable. Long enough to cover a holiday with no internet, short enough
 * that a genuinely dead token doesn't linger forever.
 */
export const RENEWAL_GRACE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export interface LicenseState {
  /** Whether the user has an active license */
  isActivated: boolean;
  /** The license tier */
  tier: LicenseTier;
  /** Stored token (for re-validation) */
  token: string | null;
  /** Signed payload from server (for offline verification) */
  signedPayload: string | null;
  /** Expiry timestamp (ms) for the cached validation */
  expiresAt: number | null;
  /** Unique device ID generated on first install */
  deviceId: string;
  /** When the server last confirmed this license (ms) */
  lastValidatedAt: number | null;
  /**
   * Deadline (ms) for the offline grace window. Set when renewal fails for a
   * reason that isn't the user's fault; cleared on the next success.
   */
  graceUntil: number | null;
  /** Error code from the last failed renewal, for surfacing in the UI */
  lastRenewError: string | null;
  /** Whether a preview is currently active */
  isPreviewActive: boolean;
  /** The theme ID being previewed */
  previewThemeId: string | null;

  // Actions
  activate: (token: string, signedPayload: string, expiresAt: number, tier: LicenseTier) => void;
  /**
   * Forget the license on this install only.
   *
   * Local state, nothing else — the server still counts this device against the
   * activation limit. To give the slot back, call `releaseLicense()` from
   * `license-api` first; see `useLicenseRelease`. Used on its own only when
   * there is no slot to return (dismissing a rejected license).
   */
  deactivate: () => void;
  /** Renewal reached the server and the token is still good. */
  markRenewed: (signedPayload: string, expiresAt: number, tier: LicenseTier) => void;
  /** Renewal couldn't reach the server. Keep the entitlement, extend grace. */
  markRenewUnreachable: (error: string) => void;
  /** The server rejected the token for good. Drop the entitlement, keep the reason. */
  markRenewRejected: (error: string) => void;
  startPreview: (themeId: string) => void;
  endPreview: () => void;
  setDeviceId: (id: string) => void;
}

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await browser?.storage?.local?.get(name);
      return (result?.[name] as string) || null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await browser.storage.local.set({ [name]: value });
    } catch {
      // silent
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await browser.storage.local.remove(name);
    } catch {
      // silent
    }
  },
};

/** Generate a stable device ID */
function generateDeviceId(): string {
  return crypto.randomUUID();
}

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      isActivated: false,
      tier: 'none',
      token: null,
      signedPayload: null,
      expiresAt: null,
      deviceId: generateDeviceId(),
      lastValidatedAt: null,
      graceUntil: null,
      lastRenewError: null,
      isPreviewActive: false,
      previewThemeId: null,

      activate: (token, signedPayload, expiresAt, tier) =>
        set({
          isActivated: true,
          tier,
          token,
          signedPayload,
          expiresAt,
          lastValidatedAt: Date.now(),
          graceUntil: null,
          lastRenewError: null,
        }),

      deactivate: () =>
        set({
          isActivated: false,
          tier: 'none',
          token: null,
          signedPayload: null,
          expiresAt: null,
          lastValidatedAt: null,
          graceUntil: null,
          lastRenewError: null,
        }),

      markRenewed: (signedPayload, expiresAt, tier) =>
        set({
          isActivated: true,
          tier,
          signedPayload,
          expiresAt,
          lastValidatedAt: Date.now(),
          graceUntil: null,
          lastRenewError: null,
        }),

      markRenewUnreachable: (error) => {
        const { graceUntil, expiresAt } = get();
        // Anchor the grace window to the moment the validation window lapsed, not
        // to "now" — otherwise every retry would push the deadline further out and
        // the window would never close.
        const anchor = expiresAt ?? Date.now();
        set({
          graceUntil: graceUntil ?? anchor + RENEWAL_GRACE_MS,
          lastRenewError: error,
        });
      },

      markRenewRejected: (error) =>
        set({
          isActivated: false,
          tier: 'none',
          signedPayload: null,
          expiresAt: null,
          graceUntil: null,
          lastRenewError: error,
          // `token` is deliberately kept so the UI can explain which license
          // stopped working instead of silently reverting to the sales page.
        }),

      startPreview: (themeId) =>
        set({
          isPreviewActive: true,
          previewThemeId: themeId,
        }),

      endPreview: () =>
        set({
          isPreviewActive: false,
          previewThemeId: null,
        }),

      setDeviceId: (id) => set({ deviceId: id }),
    }),
    {
      name: LICENSE_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // v1 had no renewal bookkeeping and no background renewal job, so a
          // 14-day-old install is sitting on an expired `expiresAt` through no
          // fault of the user. Open the grace window from now so they stay
          // entitled until the renewal job gets a word in.
          persistedState.lastValidatedAt = persistedState.expiresAt
            ? persistedState.expiresAt - 14 * 24 * 60 * 60 * 1000
            : null;
          persistedState.lastRenewError = null;
          persistedState.graceUntil = persistedState.isActivated
            ? Date.now() + RENEWAL_GRACE_MS
            : null;
        }
        return persistedState;
      },
    },
  ),
);

/**
 * Check if the license currently entitles the user to premium features.
 *
 * Valid inside the server-backed window, and also inside the offline grace
 * window — a user whose renewal can't reach the server has not stopped being a
 * customer.
 */
export function isLicenseValid(state: LicenseState): boolean {
  if (!state.isActivated) return false;
  const now = Date.now();
  if (state.expiresAt && now < state.expiresAt) return true;
  if (state.graceUntil && now < state.graceUntil) return true;
  return false;
}

/**
 * True when the license is only alive because of the grace window, i.e. renewal
 * has been failing. The UI uses this to warn before the user is cut off.
 */
export function isLicenseInGracePeriod(state: LicenseState): boolean {
  if (!isLicenseValid(state)) return false;
  const now = Date.now();
  return !(state.expiresAt && now < state.expiresAt);
}

/**
 * Check if the current user has Power Pack (or higher) tier.
 * Used by Agent Loop for paywall checks.
 */
export function isPowerPackUser(): boolean {
  const state = useLicenseStore.getState();
  if (!isLicenseValid(state)) return false;
  return state.tier === 'power_pack' || state.tier === 'pro';
}

// Keep every extension context in step. Activation happens in the settings panel
// of one tab, renewal happens in the background service worker — without this,
// other open tabs would keep serving a stale entitlement until reloaded.
if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[LICENSE_STORAGE_KEY]) return;
    void useLicenseStore.persist.rehydrate();
  });
}
