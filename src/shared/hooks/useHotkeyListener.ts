import { useEffect } from 'react';
import {
  useHotkeyStore,
  HOTKEY_DEFINITIONS,
  HotkeyActionId,
  keyEventToBindingString,
} from '@/shared/lib/hotkey-store';
import { useCommandPaletteStore } from '@/shared/lib/command-palette-store';
import { useAppStore } from '@/shared/lib/store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { detectPlatform, Platform } from '@/shared/types/platform';
import {
  toggleGeminiSidebar,
  toggleAIStudioSidebar,
} from '@/shared/lib/dom-selectors';

// ─── Action Handlers ─────────────────────────────────────────────────────────

/**
 * Centralized action dispatcher. Each action is a pure function that reads
 * from stores and performs the side effect. No React component coupling.
 */
const actionHandlers: Record<HotkeyActionId, () => void> = {
  /**
   * Collapse or expand the native sidebar.
   *
   * Clicks the platform's own control rather than writing our state directly, so
   * the real animation runs and the observers that mirror the collapsed state
   * stay in agreement with the page.
   *
   * Dispatched on the detected platform instead of trying one platform's
   * selectors and falling through to the other's. The fall-through worked while
   * the two selector sets could not both match, but AI Studio's toggle now
   * depends on which direction it is going, so "did the click land" is no longer
   * a reliable signal for "is this AI Studio".
   */
  toggleSidebar: () => {
    if (detectPlatform() === Platform.AI_STUDIO) toggleAIStudioSidebar();
    else toggleGeminiSidebar();
  },

  /**
   * Toggle, not open: ⌘K is muscle memory for "get me out of here" as much as
   * "get me somewhere", and pressing it twice should leave the page as it was.
   */
  openCommandPalette: () => {
    useCommandPaletteStore.getState().toggle();
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
    const current = usePegasusStore.getState().enhancedFeatures.gemini.zenMode;
    usePegasusStore.getState().setGeminiEnhancedFeature('zenMode', !current);
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

// ─── Dispatcher ──────────────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent) {
  // Skip if a hotkey recorder is active
  if ((window as any).__BETTER_SIDEBAR_HOTKEY_RECORDING__) return;

  // Convert event to binding string
  const bindingStr = keyEventToBindingString(e);
  if (!bindingStr) return;

  // Look up action
  const actionId = buildBindingMap().get(bindingStr);
  if (!actionId) return;

  // Typing wins over shortcuts, unless the action opted in. Checked after the
  // lookup so an opted-in binding stays live inside the composer while every
  // other binding still yields to it.
  // activeElement is walked through shadow roots — our own UI lives in one.
  if (!HOTKEY_DEFINITIONS[actionId]?.allowInInput) {
    const active = getDeepActiveElement();
    if (active && isEditableElement(active)) return;
  }

  // Prevent default browser behavior and execute
  e.preventDefault();
  e.stopPropagation();

  const handler = actionHandlers[actionId];
  if (handler) handler();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Refcount, so several mount points can ask for hotkeys without the dispatcher
 * running twice. Two callers is the normal case: the enhanced-features tree
 * (always mounted, keeps shortcuts alive while our sidebar is switched off) and
 * the overlay panel (remounted whenever the sidebar layout changes).
 *
 * Without this, a toggle-style action would fire twice and cancel itself out.
 */
let listenerRefs = 0;

/**
 * Mounts a global keydown listener that dispatches hotkey actions.
 * Safe to call from more than one component — only one listener is installed.
 *
 * Design decisions:
 * - Reads bindings from store on each keypress (always up-to-date, no subscription needed)
 * - Ignores events when user is typing, unless the action sets `allowInInput`
 * - Ignores events when the settings hotkey recorder is active
 * - Uses capture phase to run before other listeners
 */
export function useHotkeyListener() {
  useEffect(() => {
    // Use capture phase so we can intercept before other handlers
    if (listenerRefs === 0) {
      document.addEventListener('keydown', handleKeyDown, true);
    }
    listenerRefs += 1;

    return () => {
      listenerRefs -= 1;
      if (listenerRefs === 0) {
        document.removeEventListener('keydown', handleKeyDown, true);
      }
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
