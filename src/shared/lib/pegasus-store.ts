import { create } from 'zustand';
import {
  initPegasusZustandStoreBackend,
  pegasusZustandStoreReady,
} from '@webext-pegasus/store-zustand';
import type { ThemePresetId } from '@/themes/types';

// Get default language from browser
const getDefaultLanguage = ():
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'pt'
  | 'es'
  | 'ru'
  | 'ko'
  | 'de'
  | 'fr'
  | 'it'
  | 'pl'
  | 'tr' => {
  const browserLang = navigator.language || navigator.languages?.[0] || 'en';
  if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) {
    return 'zh-TW';
  }
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  if (browserLang.startsWith('ja')) {
    return 'ja';
  }
  if (browserLang.startsWith('ko')) {
    return 'ko';
  }
  if (browserLang.startsWith('de')) {
    return 'de';
  }
  if (browserLang.startsWith('fr')) {
    return 'fr';
  }
  if (browserLang.startsWith('it')) {
    return 'it';
  }
  if (browserLang.startsWith('pl')) {
    return 'pl';
  }
  if (browserLang.startsWith('tr')) {
    return 'tr';
  }
  if (browserLang.startsWith('pt')) {
    return 'pt';
  }
  if (browserLang.startsWith('es')) {
    return 'es';
  }
  if (browserLang.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
};

export interface SelectionToolbarConfig {
  enabled: boolean;
  reference: boolean;
  explain: boolean;
  saveAsSnippet: boolean;
  summarize: boolean;
  copy: boolean;
  saveAsPrompt: boolean;
  /** @deprecated use `copy` instead */
  copyAsMarkdown?: boolean;
}

export interface GeminiEnhancedFeatures {
  defaultModel: 'default' | 'flash-lite' | 'flash' | 'pro';
  sidebarWidth: number;
  chatWidth: number;
  inputWidth: number;
  hideBrand: boolean;
  hideDisclaimer: boolean;
  hideUpgrade: boolean;
  showTopBarTag: boolean;
  zenMode: boolean;
  showSmartScrollbar: boolean;
  autoHideInput: boolean;
  showHotkeyHelper: boolean;
  slashCommand: boolean;
  /** `>` in the composer opens the agent launcher popup */
  agentTrigger: boolean;
  removeWatermark: boolean;
  tableAutoWidth: boolean;
  selectionToolbar: SelectionToolbarConfig;
}

export interface AIStudioEnhancedFeatures {
  sidebarWidth: number;
  autoHideInput: boolean;
  autoHideRunSettings: boolean;
  showHotkeyHelper: boolean;
  slashCommand: boolean;
  /** `>` in the composer opens the agent launcher popup */
  agentTrigger: boolean;
}

export type SupportedLanguage =
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'pt'
  | 'es'
  | 'ru'
  | 'ko'
  | 'de'
  | 'fr'
  | 'it'
  | 'pl'
  | 'tr';

interface PegasusState {
  language: SupportedLanguage;
  gdriveAutoSync: boolean;
  gdriveSyncing: boolean;
  theme: 'light' | 'dark' | 'system';
  customTheme: ThemePresetId | null;
  backupEnabled: boolean;
  backupMaxSlots: number;
  enhancedFeatures: {
    gemini: GeminiEnhancedFeatures;
    aistudio: AIStudioEnhancedFeatures;
  };
  setGeminiEnhancedFeature: <K extends keyof GeminiEnhancedFeatures>(
    key: K,
    value: GeminiEnhancedFeatures[K],
  ) => void;
  setAIStudioEnhancedFeature: <K extends keyof AIStudioEnhancedFeatures>(
    key: K,
    value: AIStudioEnhancedFeatures[K],
  ) => void;
  setLanguage: (
    language: SupportedLanguage,
  ) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCustomTheme: (themeId: ThemePresetId | null) => void;
  setGdriveAutoSync: (enabled: boolean) => void;
  setGdriveSyncing: (syncing: boolean) => void;
  setBackupEnabled: (enabled: boolean) => void;
  setBackupMaxSlots: (slots: number) => void;
}

export const usePegasusStore = create<PegasusState>()((set) => ({
  language: getDefaultLanguage(),
  gdriveAutoSync: true,
  gdriveSyncing: false,
  theme: 'system',
  customTheme: null,
  backupEnabled: true,
  backupMaxSlots: 5,
  enhancedFeatures: {
    gemini: {
      defaultModel: 'default',
      sidebarWidth: 360,
      chatWidth: 46,
      inputWidth: 42,
      hideBrand: false,
      hideDisclaimer: false,
      hideUpgrade: false,
      showTopBarTag: true,
      zenMode: false,
      showSmartScrollbar: true,
      autoHideInput: false,
      showHotkeyHelper: true,
      slashCommand: true,
      agentTrigger: true,
      removeWatermark: true,
      tableAutoWidth: false,
      selectionToolbar: {
        enabled: true,
        reference: true,
        explain: true,
        saveAsSnippet: true,
        summarize: false,
        copy: true,
        saveAsPrompt: true,
      },
    },
    aistudio: {
      sidebarWidth: 320,
      autoHideInput: false,
      autoHideRunSettings: false,
      showHotkeyHelper: true,
      slashCommand: true,
      agentTrigger: true,
    },
  },
  setGeminiEnhancedFeature: (key, value) =>
    set((state) => ({
      ...state,
      enhancedFeatures: {
        ...state.enhancedFeatures,
        gemini: {
          ...state.enhancedFeatures.gemini,
          [key]: value,
        },
      },
    })),
  setAIStudioEnhancedFeature: (key, value) =>
    set((state) => ({
      ...state,
      enhancedFeatures: {
        ...state.enhancedFeatures,
        aistudio: {
          ...state.enhancedFeatures.aistudio,
          [key]: value,
        },
      },
    })),
  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setCustomTheme: (customTheme) => set({ customTheme }),
  setGdriveAutoSync: (gdriveAutoSync) => set({ gdriveAutoSync }),
  setGdriveSyncing: (gdriveSyncing) => set({ gdriveSyncing }),
  setBackupEnabled: (backupEnabled) => set({ backupEnabled }),
  setBackupMaxSlots: (backupMaxSlots) =>
    set({ backupMaxSlots: Math.min(Math.max(backupMaxSlots, 1), 20) }),
}));

export const STORE_NAME = 'pegasusGlobalStore';

/**
 * Default values for enhancedFeatures sub-objects.
 * Used to backfill missing keys when store is rehydrated from storage
 * (e.g. aistudio was added after a user already had gemini settings persisted).
 */
const DEFAULT_ENHANCED_FEATURES: PegasusState['enhancedFeatures'] = {
  gemini: {
    defaultModel: 'default',
    sidebarWidth: 360,
    chatWidth: 46,
    inputWidth: 42,
    hideBrand: false,
    hideDisclaimer: false,
    hideUpgrade: false,
    showTopBarTag: true,
    zenMode: false,
    showSmartScrollbar: true,
    autoHideInput: false,
    showHotkeyHelper: true,
    slashCommand: true,
    agentTrigger: true,
    removeWatermark: true,
    tableAutoWidth: false,
    selectionToolbar: {
      enabled: true,
      reference: true,
      explain: true,
      saveAsSnippet: true,
      summarize: false,
      copy: true,
      saveAsPrompt: true,
    },
  },
  aistudio: {
    sidebarWidth: 320,
    autoHideInput: false,
    autoHideRunSettings: false,
    showHotkeyHelper: true,
    slashCommand: true,
    agentTrigger: true,
  },
};

/**
 * Ensures enhancedFeatures has all expected platform sub-objects after rehydration.
 * `@webext-pegasus/store-zustand` uses shallow setState which can lose nested defaults
 * if the persisted state was created before a new platform key was introduced.
 */
function ensureEnhancedFeaturesDefaults() {
  const state = usePegasusStore.getState();
  const ef = state.enhancedFeatures;
  let patched = false;
  const updated = { ...ef };

  for (const [key, defaults] of Object.entries(DEFAULT_ENHANCED_FEATURES)) {
    const k = key as keyof typeof DEFAULT_ENHANCED_FEATURES;
    const persisted = updated[k];

    // Whole platform object missing — take defaults wholesale
    if (!persisted) {
      updated[k] = defaults as any;
      patched = true;
      continue;
    }

    // Platform object exists but may predate newly added feature keys.
    // Backfill only the missing ones so user choices are preserved.
    const merged = { ...(defaults as any) };
    let platformPatched = false;
    for (const featureKey of Object.keys(defaults as any)) {
      if ((persisted as any)[featureKey] === undefined) {
        platformPatched = true;
      } else {
        merged[featureKey] = (persisted as any)[featureKey];
      }
    }

    if (platformPatched) {
      updated[k] = merged;
      patched = true;
    }
  }

  if (patched) {
    usePegasusStore.setState({ enhancedFeatures: updated });
  }
}

export const initPegasusBackendStore = async () => {
  await initPegasusZustandStoreBackend(STORE_NAME, usePegasusStore, {
    storageStrategy: 'local',
  });
  ensureEnhancedFeaturesDefaults();
};

export const getPegasusStoreReady = async () => {
  await pegasusZustandStoreReady(STORE_NAME, usePegasusStore);
  ensureEnhancedFeaturesDefaults();
};

/** Storage key used by @webext-pegasus/store to persist this store. */
const STORE_STORAGE_KEY = `pegasus-store/${STORE_NAME}`;

/**
 * Hydrate the store straight from `storage.local`, without talking to the
 * background service worker.
 *
 * `getPegasusStoreReady()` needs the MV3 service worker to be alive and to have
 * finished registering its RPC bridge. On the first click after the worker has
 * idled out that costs a full worker cold start, so any UI that awaits it before
 * rendering appears frozen. Reading the persisted snapshot directly is a single
 * storage hit (single-digit ms) and gives us the exact same values the worker
 * would have handed back.
 */
export const hydratePegasusStoreFromCache = async () => {
  try {
    const { [STORE_STORAGE_KEY]: raw } =
      await browser.storage.local.get(STORE_STORAGE_KEY);
    if (typeof raw === 'string') {
      const cached = JSON.parse(raw);
      if (cached && typeof cached === 'object') {
        usePegasusStore.setState(cached);
      }
    }
  } catch (err) {
    console.warn('[PegasusStore] Cache hydration failed:', err);
  }
  ensureEnhancedFeaturesDefaults();
};

let syncPromise: Promise<void> | null = null;

/**
 * Start (once) the real handshake with the background store. Returns a promise
 * that resolves when writes are safe to make, i.e. when local `setState` calls
 * are forwarded to the background and persisted.
 *
 * The promise never rejects and gives up after 5s so a broken/unreachable
 * worker cannot freeze the UI forever.
 */
export const startPegasusStoreSync = (): Promise<void> => {
  syncPromise ??= new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[PegasusStore] Background sync timed out after 5s');
      resolve();
    }, 5000);
    getPegasusStoreReady()
      .catch((err) => console.error('[PegasusStore] Sync failed:', err))
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
  return syncPromise;
};

/** Await the background handshake before writing to the store. */
export const whenPegasusStoreReady = (): Promise<void> =>
  syncPromise ?? startPegasusStoreSync();
