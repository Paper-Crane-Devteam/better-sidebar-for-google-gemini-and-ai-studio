import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A hotkey binding is stored as a string like "Alt+Shift+N" or "Alt+1".
 * null means the shortcut is unbound (disabled).
 */
export type HotkeyBinding = string | null;

/** Categories for grouping shortcuts in the UI */
export type HotkeyCategory = 'general' | 'navigation' | 'actions';

export interface HotkeyDefinition {
  /** Unique ID for this shortcut action */
  id: string;
  /** i18n key for the label */
  labelKey: string;
  /** Category for UI grouping */
  category: HotkeyCategory;
  /** Default key binding */
  defaultBinding: HotkeyBinding;
  /** Platforms this hotkey is available on. If omitted, available on all. */
  platforms?: ('gemini' | 'aistudio')[];
}

/** All available shortcut action IDs */
export type HotkeyActionId =
  // General
  | 'toggleSidebar'
  | 'newConversation'
  | 'openSearch'
  | 'openSettings'
  // Navigation (tab switching)
  | 'navExplorer'
  | 'navSearch'
  | 'navPrompts'
  | 'navTags'
  | 'navFavorites'
  | 'navGems'
  | 'navNotebooks'
  // Actions
  | 'toggleZenMode'
  | 'switchOriginalUI'
  | 'toggleBatchMode'
  | 'collapseAll'
  | 'toggleViewMode';

// ─── Default Definitions ─────────────────────────────────────────────────────

export const HOTKEY_DEFINITIONS: Record<HotkeyActionId, HotkeyDefinition> = {
  // General
  toggleSidebar: {
    id: 'toggleSidebar',
    labelKey: 'hotkeys.toggleSidebar',
    category: 'general',
    defaultBinding: 'Alt+Shift+S',
  },
  newConversation: {
    id: 'newConversation',
    labelKey: 'hotkeys.newConversation',
    category: 'general',
    defaultBinding: 'Alt+Shift+N',
  },
  openSearch: {
    id: 'openSearch',
    labelKey: 'hotkeys.openSearch',
    category: 'general',
    defaultBinding: 'Alt+Shift+F',
  },
  openSettings: {
    id: 'openSettings',
    labelKey: 'hotkeys.openSettings',
    category: 'general',
    defaultBinding: 'Alt+Shift+,',
  },

  // Navigation
  navExplorer: {
    id: 'navExplorer',
    labelKey: 'hotkeys.navExplorer',
    category: 'navigation',
    defaultBinding: 'Alt+1',
  },
  navSearch: {
    id: 'navSearch',
    labelKey: 'hotkeys.navSearch',
    category: 'navigation',
    defaultBinding: 'Alt+2',
  },
  navPrompts: {
    id: 'navPrompts',
    labelKey: 'hotkeys.navPrompts',
    category: 'navigation',
    defaultBinding: 'Alt+3',
  },
  navTags: {
    id: 'navTags',
    labelKey: 'hotkeys.navTags',
    category: 'navigation',
    defaultBinding: 'Alt+4',
  },
  navFavorites: {
    id: 'navFavorites',
    labelKey: 'hotkeys.navFavorites',
    category: 'navigation',
    defaultBinding: 'Alt+5',
  },
  navGems: {
    id: 'navGems',
    labelKey: 'hotkeys.navGems',
    category: 'navigation',
    defaultBinding: 'Alt+6',
    platforms: ['gemini'],
  },
  navNotebooks: {
    id: 'navNotebooks',
    labelKey: 'hotkeys.navNotebooks',
    category: 'navigation',
    defaultBinding: 'Alt+7',
    platforms: ['gemini'],
  },

  // Actions
  toggleZenMode: {
    id: 'toggleZenMode',
    labelKey: 'hotkeys.toggleZenMode',
    category: 'actions',
    defaultBinding: 'Alt+Shift+Z',
    platforms: ['gemini'],
  },
  switchOriginalUI: {
    id: 'switchOriginalUI',
    labelKey: 'hotkeys.switchOriginalUI',
    category: 'actions',
    defaultBinding: 'Alt+Shift+Q',
  },
  toggleBatchMode: {
    id: 'toggleBatchMode',
    labelKey: 'hotkeys.toggleBatchMode',
    category: 'actions',
    defaultBinding: 'Alt+Shift+B',
  },
  collapseAll: {
    id: 'collapseAll',
    labelKey: 'hotkeys.collapseAll',
    category: 'actions',
    defaultBinding: 'Alt+Shift+C',
  },
  toggleViewMode: {
    id: 'toggleViewMode',
    labelKey: 'hotkeys.toggleViewMode',
    category: 'actions',
    defaultBinding: 'Alt+Shift+T',
  },
};

// ─── Store ───────────────────────────────────────────────────────────────────

type HotkeyBindings = Record<HotkeyActionId, HotkeyBinding>;

interface HotkeyState {
  /** User's custom bindings (overrides defaults) */
  bindings: HotkeyBindings;

  /** Get the effective binding for an action */
  getBinding: (id: HotkeyActionId) => HotkeyBinding;
  /** Set a custom binding for an action */
  setBinding: (id: HotkeyActionId, binding: HotkeyBinding) => void;
  /** Reset a single binding to its default */
  resetBinding: (id: HotkeyActionId) => void;
  /** Reset all bindings to defaults */
  resetAll: () => void;
  /** Check if a binding string is already used by another action */
  isConflict: (binding: string, excludeId?: HotkeyActionId) => HotkeyActionId | null;
}

const getDefaultBindings = (): HotkeyBindings => {
  const bindings = {} as HotkeyBindings;
  for (const [id, def] of Object.entries(HOTKEY_DEFINITIONS)) {
    bindings[id as HotkeyActionId] = def.defaultBinding;
  }
  return bindings;
};

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await browser?.storage?.local?.get(name);
      return (result?.[name] as string) || null;
    } catch (e) {
      console.error('Error reading hotkey storage:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await browser.storage.local.set({ [name]: value });
    } catch (e) {
      console.error('Error writing hotkey storage:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await browser.storage.local.remove(name);
    } catch (e) {
      console.error('Error removing hotkey storage:', e);
    }
  },
};

export const useHotkeyStore = create<HotkeyState>()(
  persist(
    (set, get) => ({
      bindings: getDefaultBindings(),

      getBinding: (id) => {
        return get().bindings[id] ?? HOTKEY_DEFINITIONS[id]?.defaultBinding ?? null;
      },

      setBinding: (id, binding) => {
        set((state) => ({
          bindings: { ...state.bindings, [id]: binding },
        }));
      },

      resetBinding: (id) => {
        set((state) => ({
          bindings: {
            ...state.bindings,
            [id]: HOTKEY_DEFINITIONS[id].defaultBinding,
          },
        }));
      },

      resetAll: () => {
        set({ bindings: getDefaultBindings() });
      },

      isConflict: (binding, excludeId) => {
        const { bindings } = get();
        for (const [id, b] of Object.entries(bindings)) {
          if (id !== excludeId && b === binding) {
            return id as HotkeyActionId;
          }
        }
        return null;
      },
    }),
    {
      name: 'better-sidebar-hotkeys',
      storage: createJSONStorage(() => storage),
      version: 3,
      migrate: (persistedState: any, version: number) => {
        // v1/v2 → v3: switchOriginalUI changed from Alt+Shift+O to Alt+Shift+Q
        if (version < 3) {
          return { bindings: getDefaultBindings() };
        }
        return persistedState;
      },
    },
  ),
);

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Parse a KeyboardEvent into a binding string like "Alt+Shift+N".
 * Returns null if only modifier keys are pressed.
 *
 * Uses e.code (physical key) instead of e.key to avoid macOS Option key
 * producing special characters (e.g. Option+S → ß on macOS).
 */
export function keyEventToBindingString(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Ignore standalone modifier key presses
  const ignoredCodes = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'];
  if (ignoredCodes.includes(e.code)) return null;

  // Map physical key code to a readable key name
  const key = codeToKeyName(e.code, e.key);
  if (!key) return null;

  parts.push(key);
  return parts.join('+');
}

/**
 * Convert a KeyboardEvent.code to a human-readable key name.
 * Falls back to e.key for unknown codes.
 */
function codeToKeyName(code: string, fallbackKey: string): string | null {
  // Letter keys: KeyA → A, KeyB → B, etc.
  if (code.startsWith('Key')) {
    return code.slice(3); // Already uppercase
  }
  // Digit keys: Digit1 → 1, Digit0 → 0
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  // Numpad keys: Numpad1 → Num1
  if (code.startsWith('Numpad')) {
    return 'Num' + code.slice(6);
  }
  // Function keys: F1-F12
  if (/^F\d+$/.test(code)) {
    return code;
  }
  // Common special keys
  const codeMap: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Escape: 'Esc',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  };

  if (codeMap[code]) return codeMap[code];

  // Fallback: use the key value if it's a single printable character
  if (fallbackKey.length === 1) return fallbackKey.toUpperCase();

  return null;
}

/**
 * Format a binding string for display.
 * On macOS, replaces modifier names with symbols.
 */
export function formatBindingDisplay(binding: HotkeyBinding): string {
  if (!binding) return '—';

  const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
  if (!isMac) return binding;

  return binding
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧');
}
