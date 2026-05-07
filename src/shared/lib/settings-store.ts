import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { detectPlatform, Platform } from '../types/platform';
import {
  syncGeminiTheme,
  syncAiStudioTheme,
  syncChatGPTTheme,
} from './utils/utils';

interface GeminiEnhancedFeatures {
  defaultModel: 'default' | 'fast' | 'thinking' | 'pro';
  sidebarWidth: number;
  chatWidth: number;
  inputWidth: number;
  hideBrand: boolean;
  hideDisclaimer: boolean;
  hideUpgrade: boolean;
  showTopBarTag: boolean;
  zenMode: boolean;
  showSmartScrollbar: boolean;
  quickResend: boolean;
}

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  layoutDensity: 'compact' | 'relaxed';
  newChatBehavior: 'current-tab' | 'new-tab';
  autoScanLibrary: boolean;
  overlayPosition: { x: number; y: number };
  lastSelectedGemId: string | null;
  explorer: {
    viewMode: 'tree' | 'timeline';
    sortOrder: 'alpha' | 'date';
    ignoredFolders: string[];
    enableRightClickRename: boolean;
  };
  shortcuts: {
    favorites: boolean;
    build: boolean;
    dashboard: boolean;
    documentation: boolean;
    images: boolean;
    apps: boolean;
    codex: boolean;
    myStuff: boolean;
    gems: boolean;
    notebooks: boolean;
    originalUI: boolean;
  };
  enhancedFeatures: {
    gemini: GeminiEnhancedFeatures;
  };

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLayoutDensity: (density: 'compact' | 'relaxed') => void;
  setNewChatBehavior: (behavior: 'current-tab' | 'new-tab') => void;
  setAutoScanLibrary: (enabled: boolean) => void;
  setOverlayPosition: (position: { x: number; y: number }) => void;
  setExplorerViewMode: (mode: 'tree' | 'timeline') => void;
  setExplorerSortOrder: (order: 'alpha' | 'date') => void;
  setExplorerIgnoredFolders: (folders: string[]) => void;
  setExplorerEnableRightClickRename: (enabled: boolean) => void;
  setShortcutVisible: (
    key: keyof SettingsState['shortcuts'],
    visible: boolean,
  ) => void;
  setGeminiFeature: <K extends keyof GeminiEnhancedFeatures>(
    key: K,
    value: GeminiEnhancedFeatures[K],
  ) => void;
  setLastSelectedGemId: (id: string | null) => void;
}

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await browser?.storage?.local?.get(name);
      return (result?.[name] as string) || null;
    } catch (e) {
      console.error('Error reading from storage:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await browser.storage.local.set({ [name]: value });
    } catch (e) {
      console.error('Error writing to storage:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await browser.storage.local.remove(name);
    } catch (e) {
      console.error('Error removing from storage:', e);
    }
  },
};

const platform = detectPlatform();

// Determine storage key
const getStorageName = () => {
  if (platform === Platform.GEMINI) {
    return 'better-sidebar-for-gemini-settings';
  }
  if (platform === Platform.AI_STUDIO) {
    return 'prompt-manager-for-google-ai-studio-settings';
  }
  if (platform === Platform.CHATGPT) {
    return 'prompt-manager-for-chatgpt-settings';
  }
  if (platform === Platform.CLAUDE) {
    return 'prompt-manager-for-claude-settings';
  }
  return 'better-sidebar-for-unknown-settings';
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      layoutDensity: 'relaxed',
      newChatBehavior: 'current-tab',
      autoScanLibrary: false,
      overlayPosition: { x: 16, y: 16 },
      lastSelectedGemId: null,
      explorer: {
        viewMode: 'tree',
        sortOrder: 'date',
        ignoredFolders: [],
        enableRightClickRename: true,
      },
      shortcuts: {
        favorites: false,
        build: true,
        dashboard: true,
        documentation: true,
        images: true,
        apps: true,
        codex: true,
        myStuff: true,
        gems: true,
        notebooks: true,
        originalUI: true,
      },
      enhancedFeatures: {
        gemini: {
          defaultModel: 'default',
          sidebarWidth: 360,
          chatWidth: -1,
          inputWidth: -1,
          hideBrand: false,
          hideDisclaimer: false,
          hideUpgrade: false,
          showTopBarTag: true,
          zenMode: false,
          showSmartScrollbar: true,
          quickResend: false,
        },
      },

      setTheme: (theme) => {
        set({ theme });
        if (platform === Platform.GEMINI) {
          syncGeminiTheme(theme);
        }
        if (platform === Platform.AI_STUDIO) {
          syncAiStudioTheme(theme);
        }
        if (platform === Platform.CHATGPT) {
          syncChatGPTTheme(theme);
        }
        // if(platform === Platform.CLAUDE) {
        //   syncClaudeTheme(theme)
        // }
      },
      setLayoutDensity: (layoutDensity) => set({ layoutDensity }),
      setNewChatBehavior: (newChatBehavior) => set({ newChatBehavior }),
      setAutoScanLibrary: (autoScanLibrary) => set({ autoScanLibrary }),
      setOverlayPosition: (overlayPosition) => set({ overlayPosition }),
      setExplorerViewMode: (viewMode) =>
        set((state) => ({ explorer: { ...state.explorer, viewMode } })),
      setExplorerSortOrder: (sortOrder) =>
        set((state) => ({ explorer: { ...state.explorer, sortOrder } })),
      setExplorerIgnoredFolders: (ignoredFolders) =>
        set((state) => ({ explorer: { ...state.explorer, ignoredFolders } })),
      setExplorerEnableRightClickRename: (enableRightClickRename) =>
        set((state) => ({
          explorer: { ...state.explorer, enableRightClickRename },
        })),
      setShortcutVisible: (key, visible) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [key]: visible },
        })),
      setGeminiFeature: (key, value) =>
        set((state) => ({
          enhancedFeatures: {
            ...state.enhancedFeatures,
            gemini: { ...state.enhancedFeatures.gemini, [key]: value },
          },
        })),
      setLastSelectedGemId: (id) => set({ lastSelectedGemId: id }),
    }),
    {
      name: getStorageName(),
      storage: createJSONStorage(() => storage),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          const oldEnhanced = persistedState.enhancedFeatures || {};
          persistedState.enhancedFeatures = {
            gemini: {
              defaultModel: oldEnhanced.defaultModel || 'default',
              sidebarWidth: persistedState.customSidebarWidth || 360,
              chatWidth: -1,
              inputWidth: -1,
              hideBrand: false,
              hideDisclaimer: false,
              hideUpgrade: false,
              zenMode: false,
            },
          };
          delete persistedState.enableResizableSidebar;
          delete persistedState.customSidebarWidth;
        }
        if (version < 2) {
          // Migrate old string position to {x, y} coordinates (bottom-left offset from bottom-left corner)
          const old = persistedState.overlayPosition;
          if (typeof old === 'string') {
            persistedState.overlayPosition =
              old === 'bottom-right'
                ? { x: window.innerWidth - 60, y: 16 }
                : { x: 16, y: 16 };
          }
        }
        return persistedState;
      },
    },
  ),
);
