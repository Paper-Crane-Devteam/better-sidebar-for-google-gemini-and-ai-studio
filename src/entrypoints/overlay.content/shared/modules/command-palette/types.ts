import type { ReactNode } from 'react';

/** Sections of the palette, in the order they are rendered. */
export type CommandGroupId = 'recent' | 'conversations' | 'actions' | 'settings';

export interface CommandItem {
  /** Unique across the whole palette — used as React key and for active tracking. */
  id: string;
  group: CommandGroupId;
  icon: ReactNode;
  label: string;
  /** Second line under the label (chat description, action explanation). */
  description?: string | null;
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
}
