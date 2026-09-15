import type { ReactNode } from 'react';

/** Sections of the palette, in the order they are rendered. */
export type CommandGroupId =
  | 'recent'
  | 'conversations'
  | 'messages'
  | 'actions'
  | 'settings';

/**
 * One run of text inside a highlighted string. `match` marks the runs that the
 * query hit, so the renderer never has to know anything about the query itself.
 */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface CommandItem {
  /** Unique across the whole palette — used as React key and for active tracking. */
  id: string;
  group: CommandGroupId;
  /**
   * Leading glyph. `null` keeps the slot but paints nothing: chat rows do that so
   * their titles stay on the same left edge as the icon-bearing command rows.
   */
  icon?: ReactNode | null;
  label: string;
  /**
   * Label pre-split for highlighting. Set when the query is what surfaced the
   * row; falls back to the plain `label` when absent.
   */
  labelSegments?: HighlightSegment[] | null;
  /** Second line under the label (chat description, action explanation). */
  description?: string | null;
  /**
   * Message excerpt shown under the label as one small line, pre-split for
   * highlighting. Takes priority over `description`.
   */
  snippet?: HighlightSegment[] | null;
  /** Right-hand plain text — the folder a chat sits in, for instance. */
  meta?: string | null;
  /** Right-hand key binding, rendered as keycaps. Takes priority over `meta`. */
  keys?: string | null;
  /** Extra text folded into search: tag names, English aliases, etc. */
  keywords?: string | null;
  /** Runs on Enter or click. The palette closes first, then this fires. */
  run: () => void;
}

export interface CommandGroup {
  id: CommandGroupId;
  label: string;
  items: CommandItem[];
  /**
   * Group is waiting on an async source. Kept in the list even with no items so
   * the palette can say "still looking" instead of "nothing found".
   */
  isLoading?: boolean;
}
