import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { detectPlatform, Platform } from '../types/platform';

interface SettingsState {
  /**
   * Compact mode keeps only the Library content and its overflow menu visible.
   * The left tab bar and secondary Library header actions are hidden.
   */
  compactMode: boolean;
  /**
   * Whether the "you can also click the Library title" hint has been shown.
   * The hint fires once, the first time compact mode is entered from the
   * overflow menu, so the trip through the menu stays a one-off.
   */
  compactModeHintShown: boolean;
  autoScanLibrary: boolean;
  /**
   * Fill in the transcripts of conversations that were never opened in this
   * browser, in the background, while the tab is idle.
   *
   * Off by default: it is unattended traffic against the platform on the user's
   * own session, so it should be something they chose rather than something they
   * discover. See `constants/backfill.ts` for the pacing it implies.
   */
  backfillHistory: boolean;
  /**
   * When true, deleting a single conversation happens immediately without a
   * confirmation dialog. Batch delete and folder delete always confirm.
   * Defaults to false because the deletion is irreversible.
   */
  skipDeleteConfirm: boolean;
  overlayPosition: { x: number; y: number };
  lastSelectedGemId: string | null;
  lastSelectedNotebookId: string | null;
  explorer: {
    viewMode: 'tree' | 'timeline';
    sortOrder: 'alpha' | 'date';
    ignoredFolders: string[];
    enableRightClickRename: boolean;
  };
  /**
   * User customisation of the sidebar icon bar.
   *
   * Which icons exist, which block they sit in and which of them cannot be
   * hidden is described by the icon-bar registry
   * (`overlay.content/shared/modules/icon-bar/registry.ts`); this only records
   * the user's departures from it. Storage is already per-platform — see
   * `getStorageName` — so ids need no platform prefix.
   *
   * `hidden` is authoritative: an icon shows unless its id is listed. `order` is
   * keyed by block id, and a block missing from it keeps the registry order.
   */
  iconBar: {
    hidden: string[];
    order: Partial<Record<string, string[]>>;
  };
  integrations: {
    notion: {
      apiKey: string;
      parentPageId: string;
      parentPageTitle: string;
      /** Cached connection status */
      connectionStatus: 'idle' | 'ok' | 'error';
      connectionName: string;
      connectionError: string;
      /** Cached pages list */
      cachedPages: { id: string; title: string }[];
      /** Timestamp of last successful fetch */
      lastFetchedAt: number | null;
    };
  };
  /** Persisted height of the outline panel in pixels */
  outlineHeight: number;
  /** Cached page index for the theme grid pagination (session-only, not persisted) */
  themeGridPage: number;

  // Actions
  setCompactMode: (enabled: boolean) => void;
  setCompactModeHintShown: (shown: boolean) => void;
  setAutoScanLibrary: (enabled: boolean) => void;
  setBackfillHistory: (enabled: boolean) => void;
  setSkipDeleteConfirm: (enabled: boolean) => void;
  setOverlayPosition: (position: { x: number; y: number }) => void;
  setExplorerViewMode: (mode: 'tree' | 'timeline') => void;
  setExplorerSortOrder: (order: 'alpha' | 'date') => void;
  setExplorerIgnoredFolders: (folders: string[]) => void;
  setExplorerEnableRightClickRename: (enabled: boolean) => void;
  setIconVisible: (id: string, visible: boolean) => void;
  setIconBarOrder: (group: string, ids: string[]) => void;
  resetIconBar: () => void;
  setLastSelectedGemId: (id: string | null) => void;
  setLastSelectedNotebookId: (id: string | null) => void;
  setNotionConfig: (
    config: Partial<SettingsState['integrations']['notion']>,
  ) => void;
  setOutlineHeight: (height: number) => void;
  setThemeGridPage: (page: number) => void;
}

/**
 * Where the floating toggle sits before the user ever drags it, as an offset
 * from the bottom-left corner.
 *
 * `x` clears the host's own collapsed nav rail (~72px on both Gemini and AI
 * Studio) so the button lands *beside* that sidebar instead of on top of its
 * bottom items. It cannot be exact — the rail expands, and our own sidebar
 * width is user-set — but the button is draggable, so approximate is enough.
 *
 * `y` keeps it clear of the screen edge; the old 16px read as stuck to the
 * corner and collided with page furniture that lives down there.
 */
export const DEFAULT_OVERLAY_POSITION = { x: 88, y: 56 };

/**
 * Icon bar state for a fresh profile.
 *
 * Favorites starts hidden — it is the one tab whose content is empty until the
 * user has starred something, so shipping it on would hand every new user a dead
 * icon. This is not read from the icon-bar registry on purpose: the settings store
 * also loads in the background worker, where the registry's React icons and DOM
 * availability probes have no business.
 */
const defaultIconBar = (): SettingsState['iconBar'] => ({
  hidden: ['favorites'],
  order: {},
});

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
      compactMode: false,
      compactModeHintShown: false,
      autoScanLibrary: false,
      backfillHistory: false,
      skipDeleteConfirm: false,
      overlayPosition: { ...DEFAULT_OVERLAY_POSITION },
      lastSelectedGemId: null,
      lastSelectedNotebookId: null,
      explorer: {
        viewMode: 'tree',
        sortOrder: 'date',
        ignoredFolders: [],
        enableRightClickRename: true,
      },
      iconBar: defaultIconBar(),
      integrations: {
        notion: {
          apiKey: '',
          parentPageId: '',
          parentPageTitle: '',
          connectionStatus: 'idle',
          connectionName: '',
          connectionError: '',
          cachedPages: [],
          lastFetchedAt: null,
        },
      },
      outlineHeight: 200,
      themeGridPage: 0,

      setCompactMode: (compactMode) => set({ compactMode }),
      setCompactModeHintShown: (compactModeHintShown) =>
        set({ compactModeHintShown }),
      setAutoScanLibrary: (autoScanLibrary) => set({ autoScanLibrary }),
      setBackfillHistory: (backfillHistory) => set({ backfillHistory }),
      setSkipDeleteConfirm: (skipDeleteConfirm) => set({ skipDeleteConfirm }),
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
      setIconVisible: (id, visible) =>
        set((state) => {
          const hidden = new Set(state.iconBar?.hidden ?? []);
          if (visible) hidden.delete(id);
          else hidden.add(id);
          return {
            iconBar: {
              order: state.iconBar?.order ?? {},
              hidden: [...hidden],
            },
          };
        }),
      setIconBarOrder: (group, ids) =>
        set((state) => ({
          iconBar: {
            hidden: state.iconBar?.hidden ?? [],
            order: { ...(state.iconBar?.order ?? {}), [group]: ids },
          },
        })),
      resetIconBar: () => set({ iconBar: defaultIconBar() }),
      setLastSelectedGemId: (id) => set({ lastSelectedGemId: id }),
      setLastSelectedNotebookId: (id) => set({ lastSelectedNotebookId: id }),
      setNotionConfig: (config) =>
        set((state) => ({
          integrations: {
            ...state.integrations,
            notion: { ...state.integrations.notion, ...config },
          },
        })),
      setOutlineHeight: (height) => set({ outlineHeight: height }),
      setThemeGridPage: (page) => set({ themeGridPage: page }),
    }),
    {
      name: getStorageName(),
      storage: createJSONStorage(() => storage),
      version: 11,
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { themeGridPage, ...rest } = state;
        return rest;
      },
      migrate: (persistedState: any, version: number) => {
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
        if (version < 5) {
          // enhancedFeatures moved to pegasus-store; strip from persisted settings
          delete persistedState.enhancedFeatures;
          delete persistedState.enableResizableSidebar;
          delete persistedState.customSidebarWidth;
        }
        if (version < 6) {
          // theme/customTheme moved to pegasus-store; strip from persisted settings
          delete persistedState.theme;
          delete persistedState.customTheme;
        }
        if (version < 7) {
          // The former icon-bar toggle is now compact mode. Preserve the old
          // hidden state, then remove the retired setting.
          persistedState.compactMode = persistedState.showIconBar === false;
          delete persistedState.showIconBar;
        }
        if (version < 8) {
          // Gemini Classic was removed; strip its retired persisted selector.
          delete persistedState.geminiStyle;
        }
        if (version < 9) {
          // "New chat behavior" (current tab vs new tab) was removed — new chats
          // always open in the current tab now.
          delete persistedState.newChatBehavior;
        }
        if (version < 10) {
          // The toggle's default corner moved out beside the host sidebar. Only
          // rewrite positions still sitting on the old default — anything else
          // is where the user dragged it, and that must survive the upgrade.
          const old = persistedState.overlayPosition;
          if (old && old.x === 16 && old.y === 16) {
            persistedState.overlayPosition = { ...DEFAULT_OVERLAY_POSITION };
          }
        }
        if (version < 11) {
          // The per-icon `shortcuts` booleans became the icon bar's hidden list,
          // which also covers icons that were never toggleable. Only the `false`
          // entries carry information — everything absent is visible — so the
          // rail comes out looking exactly as it did before the upgrade.
          const legacy = persistedState.shortcuts;
          const hidden: string[] = [];
          if (legacy && typeof legacy === 'object') {
            for (const [id, visible] of Object.entries(legacy)) {
              if (visible === false) hidden.push(id);
            }
          } else {
            hidden.push(...defaultIconBar().hidden);
          }
          persistedState.iconBar = { hidden, order: {} };
          delete persistedState.shortcuts;
        }
        return persistedState;
      },
    },
  ),
);

// Listen to storage changes to sync state across contexts (e.g. from popup)
if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes) => {
    const storageName = getStorageName();
    if (changes[storageName]) {
      useSettingsStore.persist.rehydrate();
    }
  });
}
