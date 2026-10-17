/**
 * ExclusiveContextMenu — drop-in replacement for <ContextMenu> that ensures
 * only one context menu is open at a time across the entire app.
 *
 * Usage: Simply replace <ContextMenu> with <ExclusiveContextMenu>.
 * All other ContextMenu* sub-components (Trigger, Content, Item, etc.)
 * remain unchanged.
 *
 * How it works:
 * A tiny zustand store tracks the currently active menu instance ID.
 * When a new menu opens, the store updates, and all other instances
 * see that their ID no longer matches → they close themselves.
 * An effect ensures `onOpenChange(false)` is called when a menu is
 * externally dismissed, so consumer highlight state stays in sync.
 */
import * as React from 'react';
import { useId, useCallback, useRef, useEffect } from 'react';
import { create } from 'zustand';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

// ─── Exclusive store ──────────────────────────────────────────────────────────

interface ExclusiveContextMenuState {
  /** ID of the currently open menu, or null if none */
  activeId: string | null;
  /** Open a specific menu (closes any other) */
  open: (id: string) => void;
  /** Close the menu only if it matches the given ID */
  close: (id: string) => void;
  /** Force close whatever is open */
  closeAll: () => void;
}

export const useExclusiveContextMenuStore = create<ExclusiveContextMenuState>(
  (set, get) => ({
    activeId: null,
    open: (id) => set({ activeId: id }),
    close: (id) => {
      if (get().activeId === id) {
        set({ activeId: null });
      }
    },
    closeAll: () => set({ activeId: null }),
  }),
);

// ─── Component ────────────────────────────────────────────────────────────────

type ContextMenuRootProps = React.ComponentPropsWithoutRef<
  typeof ContextMenuPrimitive.Root
>;

/**
 * Drop-in replacement for Radix <ContextMenu>.
 * Accepts the same props (children, modal, onOpenChange, etc.)
 * and ensures exclusivity automatically.
 *
 * Uses modal={true} to ensure reliable click handling inside shadow DOM.
 * Exclusivity (only one menu open at a time) is handled via the zustand store.
 */
export const ExclusiveContextMenu = ({
  children,
  onOpenChange,
  open: controlledOpen,
  ...rest
}: ContextMenuRootProps) => {
  const id = useId();
  const activeId = useExclusiveContextMenuStore((s) => s.activeId);
  const { open: storeOpen, close: storeClose } =
    useExclusiveContextMenuStore.getState();

  // Derived open state: this menu is open only if it's the active one
  const isOpen = activeId === id;

  // Track previous open state to detect external close
  const prevOpenRef = useRef(isOpen);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // When the menu is externally closed (another menu opened, or store cleared),
  // notify the consumer so their highlight state updates.
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      // Was open, now closed externally — notify consumer
      onOpenChangeRef.current?.(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  // Keep a ref so the effect cleanup can access the latest id
  const idRef = useRef(id);
  idRef.current = id;

  // Cleanup on unmount: if this menu was active, clear it
  useEffect(() => {
    return () => {
      storeClose(idRef.current);
    };
  }, [storeClose]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        storeOpen(id);
      } else {
        storeClose(id);
      }
      onOpenChange?.(nextOpen);
    },
    [id, storeOpen, storeClose, onOpenChange],
  );

  return (
    <ContextMenuPrimitive.Root
      {...rest}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      {children}
    </ContextMenuPrimitive.Root>
  );
};
