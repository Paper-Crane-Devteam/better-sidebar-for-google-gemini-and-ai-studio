import { create } from 'zustand';
import {
  initPegasusZustandStoreBackend,
  pegasusZustandStoreReady,
} from '@webext-pegasus/store-zustand';

// Get default language from browser
const getDefaultLanguage = ():
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'pt'
  | 'es'
  | 'ru' => {
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

interface PegasusState {
  language: 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'pt' | 'es' | 'ru';
  defaultSyncFolderId: string | null; // null = "Inbox" folder, '__root__' = root level, string = folder ID
  gdriveAutoSync: boolean;
  gdriveSyncing: boolean;
  enhancedFeatures: {
    gemini: {
      removeWatermark: boolean;
    };
  };
  setGeminiEnhancedFeature: (
    key: keyof PegasusState['enhancedFeatures']['gemini'],
    value: boolean,
  ) => void;
  setLanguage: (
    language: 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'pt' | 'es' | 'ru',
  ) => void;
  setDefaultSyncFolderId: (folderId: string | null) => void;
  setGdriveAutoSync: (enabled: boolean) => void;
  setGdriveSyncing: (syncing: boolean) => void;
}

export const usePegasusStore = create<PegasusState>()((set) => ({
  language: getDefaultLanguage(),
  defaultSyncFolderId: null,
  gdriveAutoSync: true,
  gdriveSyncing: false,
  enhancedFeatures: {
    gemini: {
      removeWatermark: true,
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
  setLanguage: (language) => set({ language }),
  setDefaultSyncFolderId: (defaultSyncFolderId) => set({ defaultSyncFolderId }),
  setGdriveAutoSync: (gdriveAutoSync) => set({ gdriveAutoSync }),
  setGdriveSyncing: (gdriveSyncing) => set({ gdriveSyncing }),
}));

export const STORE_NAME = 'pegasusGlobalStore';

export const initPegasusBackendStore = () =>
  initPegasusZustandStoreBackend(STORE_NAME, usePegasusStore, {
    storageStrategy: 'local',
  });

export const getPegasusStoreReady = () =>
  pegasusZustandStoreReady(STORE_NAME, usePegasusStore);
