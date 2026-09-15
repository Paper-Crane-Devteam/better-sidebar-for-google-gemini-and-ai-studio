import { create } from 'zustand';

/**
 * Open/closed state for the ⌘K command palette.
 *
 * Deliberately its own tiny store rather than a slice of `useAppStore`:
 * the palette lives in the always-mounted enhanced-features tree and must work
 * with the sidebar closed, and nothing about it is worth persisting.
 */
interface CommandPaletteState {
  isOpen: boolean;
  /** Current query. Reset on every open so the palette always starts clean. */
  query: string;

  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  query: '',

  open: () => set({ isOpen: true, query: '' }),
  close: () => set({ isOpen: false, query: '' }),
  toggle: () =>
    set((state) =>
      state.isOpen ? { isOpen: false, query: '' } : { isOpen: true, query: '' },
    ),
  setQuery: (query) => set({ query }),
}));
