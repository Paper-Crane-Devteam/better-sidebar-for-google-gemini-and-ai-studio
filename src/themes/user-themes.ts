/**
 * User-generated theme support.
 *
 * Handles validation, storage, and management of AI-generated custom themes.
 * User themes are stored in browser.storage.local and merged into the
 * theme registry at runtime.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import type { ThemePreset, ThemeVariable } from './types';

// ─── User Theme Type (relaxed id constraint) ────────────────────────────────

/** A user-created theme — same shape as ThemePreset but with string id */
export interface UserTheme {
  id: string;
  name: string;
  description: string;
  preferredMode: 'light' | 'dark';
  fonts?: string[];
  extraCss?: string;
  variables: ThemeVariable[];
  sidebarVariables?: ThemeVariable[];
  sidebarStyles?: Record<string, string>;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  theme?: UserTheme;
}

/** Minimum required page variables for a functional theme */
const REQUIRED_PAGE_VARIABLES = [
  '--gem-sys-color--surface',
  '--gem-sys-color--on-surface',
  '--gem-sys-color--primary',
  '--gem-sys-color--on-primary',
] as const;

/** Minimum required sidebar variables */
const REQUIRED_SIDEBAR_VARIABLES = [
  '--background',
  '--foreground',
  '--primary',
  '--primary-foreground',
] as const;

/** Allowed CSS variable property prefixes (whitelist for security) */
const ALLOWED_VARIABLE_PREFIXES = [
  '--gem-sys-color--',
  '--mat-',
  '--bard-color-',
  '--lumi-sys-color--',
  '--background',
  '--foreground',
  '--card',
  '--popover',
  '--primary',
  '--secondary',
  '--muted',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--radius',
  '--sidebar-icon-color',
  '--font-sans',
  '--overlay-',
  '--panel-',
  '--popover-',
];

/**
 * Sanitize extraCss to prevent XSS.
 * Removes any url() references that aren't data: URIs or Google Fonts,
 * removes @import, removes javascript: references.
 */
function sanitizeExtraCss(css: string): string {
  if (!css) return '';
  let sanitized = css;
  // Remove @import rules
  sanitized = sanitized.replace(/@import\s+[^;]+;?/gi, '');
  // Remove javascript: in url()
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(about:blank');
  // Remove expression()
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  // Remove -moz-binding
  sanitized = sanitized.replace(/-moz-binding\s*:/gi, '');
  return sanitized.trim();
}

/**
 * Validate a parsed JSON object as a user theme.
 */
export function validateUserTheme(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a JSON object'] };
  }

  const obj = input as Record<string, unknown>;

  // Required string fields
  if (!obj.id || typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    errors.push('Missing or invalid "id" (must be a non-empty string)');
  } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(obj.id as string) && (obj.id as string).length > 1) {
    errors.push('"id" must be kebab-case (lowercase letters, numbers, hyphens)');
  }

  if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    errors.push('Missing or invalid "name" (must be a non-empty string)');
  }

  if (!obj.description || typeof obj.description !== 'string') {
    errors.push('Missing or invalid "description"');
  }

  if (obj.preferredMode !== 'light' && obj.preferredMode !== 'dark') {
    errors.push('"preferredMode" must be "light" or "dark"');
  }

  // Variables array
  if (!Array.isArray(obj.variables) || obj.variables.length === 0) {
    errors.push('"variables" must be a non-empty array');
  } else {
    const varProps = new Set<string>();
    for (const v of obj.variables as unknown[]) {
      if (!v || typeof v !== 'object') {
        errors.push('Each variable must be an object with "property" and "value"');
        break;
      }
      const vObj = v as Record<string, unknown>;
      if (typeof vObj.property !== 'string' || typeof vObj.value !== 'string') {
        errors.push('Variable entries must have string "property" and "value" fields');
        break;
      }
      // Check property is allowed
      const prop = vObj.property as string;
      const isAllowed = ALLOWED_VARIABLE_PREFIXES.some((prefix) => prop.startsWith(prefix));
      if (!isAllowed) {
        errors.push(`Variable "${prop}" is not in the allowed list`);
      }
      varProps.add(prop);
    }

    // Check required variables
    for (const req of REQUIRED_PAGE_VARIABLES) {
      if (!varProps.has(req)) {
        errors.push(`Missing required variable: ${req}`);
      }
    }
  }

  // Sidebar variables (optional but validated if present)
  if (obj.sidebarVariables !== undefined) {
    if (!Array.isArray(obj.sidebarVariables)) {
      errors.push('"sidebarVariables" must be an array if provided');
    } else {
      const sidebarProps = new Set<string>();
      for (const v of obj.sidebarVariables as unknown[]) {
        if (!v || typeof v !== 'object') {
          errors.push('Each sidebarVariable must be an object with "property" and "value"');
          break;
        }
        const vObj = v as Record<string, unknown>;
        if (typeof vObj.property !== 'string' || typeof vObj.value !== 'string') {
          errors.push('sidebarVariable entries must have string "property" and "value" fields');
          break;
        }
        sidebarProps.add(vObj.property as string);
      }

      // Check required sidebar variables
      for (const req of REQUIRED_SIDEBAR_VARIABLES) {
        if (!sidebarProps.has(req)) {
          errors.push(`Missing required sidebar variable: ${req}`);
        }
      }
    }
  }

  // Optional fields type checks
  if (obj.fonts !== undefined && !Array.isArray(obj.fonts)) {
    errors.push('"fonts" must be an array of strings if provided');
  }

  if (obj.extraCss !== undefined && typeof obj.extraCss !== 'string') {
    errors.push('"extraCss" must be a string if provided');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build the validated theme
  const theme: UserTheme = {
    id: (obj.id as string).trim(),
    name: (obj.name as string).trim(),
    description: (obj.description as string).trim(),
    preferredMode: obj.preferredMode as 'light' | 'dark',
    fonts: Array.isArray(obj.fonts)
      ? (obj.fonts as string[]).filter((f) => typeof f === 'string')
      : undefined,
    extraCss: typeof obj.extraCss === 'string'
      ? sanitizeExtraCss(obj.extraCss)
      : undefined,
    variables: (obj.variables as Array<{ property: string; value: string }>).map((v) => ({
      property: v.property.trim(),
      value: v.value.trim(),
    })),
    sidebarVariables: Array.isArray(obj.sidebarVariables)
      ? (obj.sidebarVariables as Array<{ property: string; value: string }>).map((v) => ({
          property: v.property.trim(),
          value: v.value.trim(),
        }))
      : undefined,
    sidebarStyles: obj.sidebarStyles && typeof obj.sidebarStyles === 'object'
      ? (obj.sidebarStyles as Record<string, string>)
      : undefined,
  };

  return { valid: true, errors: [], theme };
}

/**
 * Convert a UserTheme to a ThemePreset compatible object for the engine.
 */
export function userThemeToPreset(theme: UserTheme): ThemePreset {
  return {
    ...theme,
    isPremium: true, // User themes require Support Pack
  } as unknown as ThemePreset;
}

// ─── User Theme Store ───────────────────────────────────────────────────────

interface UserThemeStore {
  /** All user-created themes */
  themes: UserTheme[];
  /** Add a new user theme (returns false if id already exists) */
  addTheme: (theme: UserTheme) => boolean;
  /** Remove a user theme by id */
  removeTheme: (id: string) => void;
  /** Update an existing user theme */
  updateTheme: (id: string, theme: UserTheme) => void;
  /** Get a theme by id */
  getTheme: (id: string) => UserTheme | undefined;
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

export const useUserThemeStore = create<UserThemeStore>()(
  persist(
    (set, get) => ({
      themes: [],

      addTheme: (theme) => {
        const existing = get().themes;
        if (existing.some((t) => t.id === theme.id)) {
          return false;
        }
        set({ themes: [...existing, theme] });
        return true;
      },

      removeTheme: (id) => {
        set({ themes: get().themes.filter((t) => t.id !== id) });
      },

      updateTheme: (id, theme) => {
        set({
          themes: get().themes.map((t) => (t.id === id ? theme : t)),
        });
      },

      getTheme: (id) => {
        return get().themes.find((t) => t.id === id);
      },
    }),
    {
      name: 'better-sidebar-user-themes',
      storage: createJSONStorage(() => storage),
      version: 1,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (!error) {
            // When user themes are loaded from storage, notify listeners
            // so the theme registry can be refreshed
            userThemeStoreHydrated = true;
            hydrationListeners.forEach((fn) => fn());
            hydrationListeners = [];
          }
        };
      },
    },
  ),
);

// ─── Hydration helpers ──────────────────────────────────────────────────────

let userThemeStoreHydrated = false;
let hydrationListeners: Array<() => void> = [];

/**
 * Returns true if the user theme store has finished loading from storage.
 */
export function isUserThemeStoreHydrated(): boolean {
  return userThemeStoreHydrated;
}

/**
 * Register a callback to run when the user theme store finishes hydrating.
 * If already hydrated, calls immediately.
 */
export function onUserThemeStoreHydrated(fn: () => void): void {
  if (userThemeStoreHydrated) {
    fn();
  } else {
    hydrationListeners.push(fn);
  }
}
