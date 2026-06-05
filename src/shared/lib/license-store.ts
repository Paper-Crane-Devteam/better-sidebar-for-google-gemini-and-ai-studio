/**
 * License / Support Pack store.
 *
 * Manages the activation state for premium features (themes, etc.)
 * Persisted in browser.storage.local, separate from settings to avoid
 * migration conflicts and keep concerns isolated.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

/** License tier derived from token prefix */
export type LicenseTier = 'support_pack' | 'pro' | 'none';

export interface LicenseState {
  /** Whether the user has an active support pack */
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
  /** Whether a preview is currently active */
  isPreviewActive: boolean;
  /** The theme ID being previewed */
  previewThemeId: string | null;

  // Actions
  activate: (token: string, signedPayload: string, expiresAt: number, tier: LicenseTier) => void;
  deactivate: () => void;
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
    (set) => ({
      isActivated: false,
      tier: 'none',
      token: null,
      signedPayload: null,
      expiresAt: null,
      deviceId: generateDeviceId(),
      isPreviewActive: false,
      previewThemeId: null,

      activate: (token, signedPayload, expiresAt, tier) =>
        set({
          isActivated: true,
          tier,
          token,
          signedPayload,
          expiresAt,
        }),

      deactivate: () =>
        set({
          isActivated: false,
          tier: 'none',
          token: null,
          signedPayload: null,
          expiresAt: null,
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
      name: 'better-sidebar-license',
      storage: createJSONStorage(() => storage),
      version: 1,
    },
  ),
);

/**
 * Check if the cached license is still valid (not expired).
 * If expired, the UI should trigger a silent re-validation.
 */
export function isLicenseValid(state: LicenseState): boolean {
  if (!state.isActivated) return false;
  if (!state.expiresAt) return false;
  return Date.now() < state.expiresAt;
}
