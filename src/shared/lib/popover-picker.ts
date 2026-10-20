import { create } from 'zustand';
import React from 'react';

/**
 * Where the popover sits relative to its anchor.
 * - `right`: to the right, vertically centered (tooltip-like, the original behavior)
 * - `bottom-end`: below, right edges aligned (dropdown-like); flips above when there is no room
 */
export type PopoverPickerPlacement = 'right' | 'bottom-end';

export interface PopoverPickerState {
  isOpen: boolean;
  /** The anchor element's bounding rect (used for positioning) */
  anchorRect: DOMRect | null;
  /** Content to render inside the popover */
  content: React.ReactNode;
  /** Optional width constraint */
  width?: number;
  placement: PopoverPickerPlacement;
}

interface PopoverPickerStore extends PopoverPickerState {
  open: <T = unknown>(options: {
    anchorRect: DOMRect;
    content: React.ReactNode;
    width?: number;
    placement?: PopoverPickerPlacement;
  }) => Promise<T | null>;
  close: () => void;
  /** Resolve the current open() promise with a value and close the popover */
  resolve: <T = unknown>(value: T) => void;
}

let _resolve: ((value: any) => void) | null = null;

const CLOSED_STATE = {
  isOpen: false,
  anchorRect: null,
  content: null,
  width: undefined,
  placement: 'right' as PopoverPickerPlacement,
};

export const usePopoverPickerStore = create<PopoverPickerStore>((set) => ({
  ...CLOSED_STATE,

  open: ({ anchorRect, content, width, placement = 'right' }) => {
    // If a previous promise is pending, resolve it with null (dismissed)
    if (_resolve) {
      _resolve(null);
      _resolve = null;
    }
    return new Promise((resolve) => {
      _resolve = resolve;
      set({ isOpen: true, anchorRect, content, width, placement });
    });
  },

  close: () => {
    // Resolve pending promise with null (user dismissed without selection)
    if (_resolve) {
      _resolve(null);
      _resolve = null;
    }
    set(CLOSED_STATE);
  },

  resolve: (value) => {
    if (_resolve) {
      _resolve(value);
      _resolve = null;
    }
    set(CLOSED_STATE);
  },
}));
