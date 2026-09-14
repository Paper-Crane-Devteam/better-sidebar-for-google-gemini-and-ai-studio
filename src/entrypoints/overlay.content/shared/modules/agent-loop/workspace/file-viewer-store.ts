/**
 * Which workspace file the reader is showing.
 *
 * A store rather than state inside the workspace tab, because the reader is not rendered
 * there. It mounts alongside the sidebar at the platform's top level so it can occupy the
 * area to the *right* of the sidebar — a panel nested inside a tab is clipped by that
 * tab, so it could only ever cover the file tree it was opened from.
 *
 * Its own store rather than a corner of the app store: the app store is the sidebar's
 * data layer (conversations, folders, snippets), and this is one transient view belonging
 * to the agent module.
 */

import { create } from 'zustand';

interface FileViewerState {
  /** Null when closed. */
  open: { workspaceId: string; path: string } | null;
  openFile: (workspaceId: string, path: string) => void;
  close: () => void;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  open: null,
  openFile: (workspaceId, path) => set({ open: { workspaceId, path } }),
  close: () => set({ open: null }),
}));
