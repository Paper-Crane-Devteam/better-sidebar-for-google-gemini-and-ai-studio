import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCommandPaletteStore } from '@/shared/lib/command-palette-store';
import { Z_INDEX } from '@/shared/lib/z-index';
import { cn } from '@/shared/lib/utils/utils';
import { useCommandItems } from './useCommandItems';
import type { CommandItem } from './types';

/**
 * How long pointer hover is ignored after an arrow keypress.
 *
 * Scrolling a row under a stationary pointer makes Chrome emit a mousemove,
 * which would hand the highlight back to whatever the mouse happens to sit on
 * and quietly undo the keypress. A short deaf period swallows those phantom
 * moves without making real ones feel sluggish.
 */
const HOVER_GRACE_MS = 150;

// ─── Keycaps ─────────────────────────────────────────────────────────────────

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'));

const MODIFIER_SYMBOLS: Record<string, string> = {
  Ctrl: isMac ? '⌘' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: isMac ? '⇧' : 'Shift',
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/70 bg-muted/50 px-1.5 font-sans text-[10px] font-medium leading-none text-muted-foreground">
    {children}
  </kbd>
);

/** Renders "Alt+Shift+S" as separate caps, with macOS symbols where they apply. */
const KeyCaps = ({ binding }: { binding: string }) => (
  <span className="inline-flex shrink-0 items-center gap-0.5">
    {binding.split('+').map((part, i) => (
      <Kbd key={i}>{MODIFIER_SYMBOLS[part] ?? part}</Kbd>
    ))}
  </span>
);

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  item: CommandItem;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}

const Row = ({ item, isActive, onSelect, onHover }: RowProps) => (
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
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
      {item.icon}
    </span>

    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm leading-tight">{item.label}</span>
      {item.description && (
        <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
          {item.description}
        </span>
      )}
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

// ─── Palette ─────────────────────────────────────────────────────────────────

/**
 * ⌘K / Ctrl+K command palette.
 *
 * Mounted in the always-on enhanced-features tree so it is reachable with the
 * sidebar collapsed or switched off entirely. Renders `null` when closed, which
 * also throws away the query and the cursor position for free.
 */
export const CommandPalette = () => {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  return isOpen ? <CommandPaletteContent /> : null;
};

const CommandPaletteContent = () => {
  const { t } = useI18n();
  const query = useCommandPaletteStore((s) => s.query);
  const setQuery = useCommandPaletteStore((s) => s.setQuery);
  const close = useCommandPaletteStore((s) => s.close);

  const groups = useCommandItems(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastKeyMoveAt = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  /** Row order as the user sees it, so arrow keys can walk across group borders. */
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  /** Rows that ⌥1…⌥9 jump to — the "recent chats" shortlist. */
  const quickJumpItems = useMemo(
    () => groups.find((group) => group.id === 'recent')?.items ?? [],
    [groups],
  );

  /** Index of the first row of each group, so rows can be numbered while rendering. */
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const group of groups) {
      offsets.push(running);
      running += group.items.length;
    }
    return offsets;
  }, [groups]);

  const activeItem = flatItems[activeIndex];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A new result set invalidates wherever the cursor was.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Results can also shrink without the query changing — a chat gets renamed by
  // a background sync, say — which would leave the cursor past the end.
  useEffect(() => {
    if (activeIndex > 0 && activeIndex > flatItems.length - 1) setActiveIndex(0);
  }, [flatItems.length, activeIndex]);

  // Keep the cursor visible during keyboard walks. Queried from the DOM rather
  // than tracked with a ref: a ref would have to be attached and detached as the
  // active row moves, and React does not guarantee the detach and the attach
  // land in that order. Layout effect so the scroll happens in the same frame as
  // the highlight and the list never appears to lag a keypress.
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector('[data-active]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, flatItems.length]);

  const runItem = (item: CommandItem | undefined) => {
    if (!item) return;
    // Close first: most commands open another surface (settings, a chat), and
    // tearing the palette down afterwards would fight with that surface's focus.
    close();
    item.run();
  };

  const move = (delta: number) => {
    if (flatItems.length === 0) return;
    lastKeyMoveAt.current = Date.now();
    setActiveIndex((current) => {
      const next = current + delta;
      // Wrap, so either end of a long list is one keypress away.
      if (next < 0) return flatItems.length - 1;
      if (next >= flatItems.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Both platforms bind bare keystrokes to "focus the composer", so nothing
    // typed in here may reach the page.
    e.stopPropagation();

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        return;
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        return;
      case 'Enter':
        e.preventDefault();
        runItem(activeItem);
        return;
    }

    // ⌥1…⌥9 jump straight to a recent chat. Alt rather than Ctrl/⌘ because the
    // browser owns Ctrl/⌘+digit for tab switching and will not hand it over.
    // e.code, not e.key, because ⌥1 on macOS reports as "¡".
    //
    // These live only while the palette is open, so they do not fight the global
    // Alt+digit tab navigation: that dispatcher yields to a focused text field,
    // and this input is one.
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      const target = quickJumpItems[Number(e.code.slice(5)) - 1];
      if (target) {
        e.preventDefault();
        runItem(target);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 flex justify-center overflow-hidden pt-[12vh] animate-in fade-in-0 duration-150"
      style={{
        zIndex: Z_INDEX.MODAL,
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'var(--overlay-blur)',
        WebkitBackdropFilter: 'var(--overlay-blur)',
      }}
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.placeholder')}
        className="flex h-fit max-h-[70vh] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-xl animate-in zoom-in-95 slide-in-from-top-2 duration-150"
        style={{
          backgroundColor: 'var(--panel-bg)',
          boxShadow: 'var(--shadow-panel)',
          backdropFilter: 'var(--panel-blur)',
          WebkitBackdropFilter: 'var(--panel-blur)',
        }}
        // The backdrop closes on mousedown; presses inside must not reach it.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Query */}
        <div className="flex items-center gap-3 border-b border-border/50 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('commandPalette.placeholder')}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded
            aria-controls="better-sidebar-command-list"
            aria-activedescendant={activeItem ? `bs-cmd-${activeIndex}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="better-sidebar-command-list"
          role="listbox"
          className="flex-1 overflow-y-auto p-2"
        >
          {flatItems.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('commandPalette.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t('commandPalette.emptyHint')}
              </p>
            </div>
          ) : (
            groups.map((group, groupIndex) => (
              <div key={group.id} role="group" aria-label={group.label} className="mb-1 last:mb-0">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
                {group.items.map((item, itemIndex) => {
                  const index = groupOffsets[groupIndex] + itemIndex;
                  return (
                    <div key={item.id} id={`bs-cmd-${index}`}>
                      <Row
                        item={item}
                        isActive={index === activeIndex}
                        onSelect={() => runItem(item)}
                        onHover={() => {
                          if (Date.now() - lastKeyMoveAt.current < HOVER_GRACE_MS) return;
                          setActiveIndex(index);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('commandPalette.hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="h-2.5 w-2.5" />
            </Kbd>
            {t('commandPalette.hintOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            {t('commandPalette.hintClose')}
          </span>
        </div>
      </div>
    </div>
  );
};
