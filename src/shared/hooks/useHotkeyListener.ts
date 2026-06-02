import { useEffect } from 'react';
import {
  useHotkeyStore,
  HotkeyActionId,
  keyEventToBindingString,
} from '@/shared/lib/hotkey-store';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { detectPlatform, Platform } from '@/shared/types/platform';

// ─── Action Handlers ─────────────────────────────────────────────────────────

/**
 * Centralized action dispatcher. Each action is a pure function that reads
 * from stores and performs the side effect. No React component coupling.
 */
const actionHandlers: Record<HotkeyActionId, () => void> = {
  toggleSidebar: () => {
    // Trigger the native sidebar toggle button instead of directly modifying
    // state, so that the actual sidebar animation fires and observers keep
    // state in sync.

    // AI Studio: toolbar toggle button
    const aiStudioBtn = document.querySelector(
      'ms-playground-toolbar .toolbar-left [aria-label="Toggle navigation menu"]',
    ) as HTMLElement;
    if (aiStudioBtn) {
      aiStudioBtn.click();
      return;
    }

    // Gemini Desktop: separate Open/Close sidebar buttons
    const closeBtn = document.querySelector(
      'button[aria-label="Close sidebar"]',
    ) as HTMLElement;
    if (closeBtn) {
      closeBtn.click();
      return;
    }
    const openBtn = document.querySelector(
      'button[aria-label="Open sidebar"]',
    ) as HTMLElement;
    if (openBtn) {
      openBtn.click();
      return;
    }

    // Gemini Mobile fallback
    const menuBtn = document.querySelector(
      'button[aria-label="Main menu"]',
    ) as HTMLElement;
    if (menuBtn) {
      menuBtn.click();
    }
  },

  newConversation: () => {
    navigateToNewChat();
  },

  openSearch: () => {
    const store = useAppStore.getState();
    // Ensure sidebar is open first
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('search');
  },

  openSettings: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setSettingsOpen(true);
  },

  // ─── Navigation ──────────────────────────────────────────────────────
  navExplorer: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('files');
  },

  navSearch: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('search');
  },

  navPrompts: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('prompts');
  },

  navTags: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('tags');
  },

  navFavorites: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('favorites');
  },

  navGems: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('gems');
  },

  navNotebooks: () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('notebooks');
  },

  // ─── Actions ─────────────────────────────────────────────────────────
  toggleZenMode: () => {
    const platform = detectPlatform();
    if (platform !== Platform.GEMINI) return; // Gemini-only
    const settings = useSettingsStore.getState();
    const current = settings.enhancedFeatures.gemini.zenMode;
    settings.setGeminiFeature('zenMode', !current);
  },

  switchOriginalUI: () => {
    const store = useAppStore.getState();
    store.setOverlayOpen(!store.ui.overlay.isOpen);
  },

  toggleBatchMode: () => {
    const store = useAppStore.getState();
    const current = store.ui.explorer.batch.isBatchMode;
    store.setExplorerBatchMode(!current);
  },

  collapseAll: () => {
    // Dispatch a custom event that ExplorerTab listens for.
    // This avoids coupling to the imperative treeRef.
    window.dispatchEvent(new CustomEvent('better-sidebar:collapse-all'));
  },

  toggleViewMode: () => {
    const store = useAppStore.getState();
    const current = store.ui.explorer.viewMode;
    store.setExplorerViewMode(current === 'tree' ? 'timeline' : 'tree');
  },
};

// ─── Binding Matcher ─────────────────────────────────────────────────────────

/**
 * Build a reverse map: binding string → action ID.
 * Rebuilt on every render (bindings rarely change, cheap operation).
 */
function buildBindingMap(): Map<string, HotkeyActionId> {
  const { bindings } = useHotkeyStore.getState();
  const map = new Map<string, HotkeyActionId>();
  for (const [id, binding] of Object.entries(bindings)) {
    if (binding) {
      map.set(binding, id as HotkeyActionId);
    }
  }
  return map;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Mounts a global keydown listener that dispatches hotkey actions.
 * Call this once in each platform's top-level layout component.
 *
 * Design decisions:
 * - Reads bindings from store on each keypress (always up-to-date, no subscription needed)
 * - Ignores events when user is typing in input/textarea/contenteditable
 * - Ignores events when the settings hotkey recorder is active
 * - Uses capture phase to run before other listeners
 */
export function useHotkeyListener() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      // Use activeElement which pierces shadow DOM via .shadowRoot?.activeElement
      const active = getDeepActiveElement();
      if (active && isEditableElement(active)) return;

      // Skip if a hotkey recorder is active
      if ((window as any).__BETTER_SIDEBAR_HOTKEY_RECORDING__) return;

      // Convert event to binding string
      const bindingStr = keyEventToBindingString(e);
      if (!bindingStr) return;

      // Look up action
      const bindingMap = buildBindingMap();
      const actionId = bindingMap.get(bindingStr);
      if (!actionId) return;

      // Prevent default browser behavior and execute
      e.preventDefault();
      e.stopPropagation();

      const handler = actionHandlers[actionId];
      if (handler) handler();
    };

    // Use capture phase so we can intercept before other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isEditableElement(el: HTMLElement): boolean {
  if (!el) return false;
  const tagName = el.tagName?.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }
  if (el.isContentEditable) return true;
  // Also check if inside a contenteditable ancestor
  if (el.closest('[contenteditable="true"]')) return true;
  return false;
}

/**
 * Traverse shadow DOM boundaries to find the truly focused element.
 */
function getDeepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement;
  }
  return el;
}
