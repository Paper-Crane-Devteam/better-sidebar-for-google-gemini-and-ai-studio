/**
 * View state for the Tags tab.
 *
 * Lives outside the component so it survives tab switches: TagsTab is
 * unmounted whenever another tab is active, and coming back should land the
 * user where they left off (same tag, same list scroll position).
 */

import { create } from 'zustand';

interface TagsViewState {
  /** Tag currently drilled into; null means the tag list is shown */
  activeTagId: string | null;
  /** Scroll offset of the tag list, restored when returning from a tag */
  listScrollTop: number;
  openTag: (tagId: string, listScrollTop?: number) => void;
  switchTag: (tagId: string) => void;
  backToList: () => void;
}

export const useTagsViewStore = create<TagsViewState>((set) => ({
  activeTagId: null,
  listScrollTop: 0,
  openTag: (tagId, listScrollTop) =>
    set((state) => ({
      activeTagId: tagId,
      listScrollTop: listScrollTop ?? state.listScrollTop,
    })),
  switchTag: (tagId) => set({ activeTagId: tagId }),
  backToList: () => set({ activeTagId: null }),
}));
