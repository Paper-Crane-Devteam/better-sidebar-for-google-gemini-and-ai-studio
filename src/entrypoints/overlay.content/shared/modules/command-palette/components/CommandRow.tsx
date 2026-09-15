import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { KeyCaps } from './Kbd';
import { HighlightedText } from './HighlightedText';
import type { CommandItem } from '../types';

export interface CommandRowProps {
  item: CommandItem;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}

export const CommandRow = ({ item, isActive, onSelect, onHover }: CommandRowProps) => (
  <div
    // A div, not a button: the input keeps DOM focus for the palette's whole
    // life so typing never stops working, which makes a focusable row here
    // misleading. `option` + `aria-selected` is how a screen reader is told
    // which row Enter would run.
    role="option"
    aria-selected={isActive}
    data-active={isActive || undefined}
    // Pointer moves, not enter/leave, so the highlight can be suppressed for a
    // moment after a keypress (see HOVER_GRACE_MS).
    onMouseMove={onHover}
    onClick={onSelect}
    className={cn(
      'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
    )}
  >
    {/* Always rendered, even when there is no glyph: chat rows leave it blank so
        their titles line up with the commands below rather than sliding left. */}
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
      {item.icon}
    </span>

    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm leading-tight">
        {item.labelSegments ? (
          <HighlightedText segments={item.labelSegments} />
        ) : (
          item.label
        )}
      </span>

      {item.snippet ? (
        <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
          <HighlightedText segments={item.snippet} />
        </span>
      ) : item.description ? (
        <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
          {item.description}
        </span>
      ) : null}
    </span>

    {item.keys ? (
      <KeyCaps binding={item.keys} />
    ) : item.meta ? (
      <span className="max-w-[35%] shrink-0 truncate text-xs text-muted-foreground">
        {item.meta}
      </span>
    ) : null}
  </div>
);
