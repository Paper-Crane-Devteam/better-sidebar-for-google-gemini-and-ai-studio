import React from 'react';

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'));

const MODIFIER_SYMBOLS: Record<string, string> = {
  Ctrl: isMac ? '⌘' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: isMac ? '⇧' : 'Shift',
};

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/70 bg-muted/50 px-1.5 font-sans text-[10px] font-medium leading-none text-muted-foreground">
    {children}
  </kbd>
);

/** Renders "Alt+Shift+S" as separate caps, with macOS symbols where they apply. */
export const KeyCaps = ({ binding }: { binding: string }) => (
  <span className="inline-flex shrink-0 items-center gap-0.5">
    {binding.split('+').map((part, i) => (
      <Kbd key={i}>{MODIFIER_SYMBOLS[part] ?? part}</Kbd>
    ))}
  </span>
);
