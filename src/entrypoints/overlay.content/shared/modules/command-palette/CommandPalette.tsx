import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCommandPaletteStore } from '@/shared/lib/command-palette-store';
import { isImeComposing } from '@/entrypoints/overlay.content/shared/lib/ime';
import { Z_INDEX } from '@/shared/lib/z-index';
import { useCommandItems } from './hooks/useCommandItems';
import { flattenItems } from './lib/flatten';
import { CommandList } from './components/CommandList';
import { Kbd } from './components/Kbd';
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
  const lastKeyMoveAt = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const flatItems = useMemo(() => flattenItems(groups), [groups]);
  const activeItem = flatItems[activeIndex];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A new result set invalidates wherever the cursor was.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Results can also shrink without the query changing — message hits landing
  // late, a chat renamed by a background sync — which would leave the cursor
  // past the end.
  useEffect(() => {
    if (activeIndex > 0 && activeIndex > flatItems.length - 1) setActiveIndex(0);
  }, [flatItems.length, activeIndex]);

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

  const handleHover = (index: number) => {
    if (Date.now() - lastKeyMoveAt.current < HOVER_GRACE_MS) return;
    setActiveIndex(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Both platforms bind bare keystrokes to "focus the composer", so nothing
    // typed in here may reach the page.
    e.stopPropagation();

    // While an IME is composing, Enter commits the candidate, the arrows move
    // through the candidate list, and Escape cancels it — none of them are ours.
    // See `isImeComposing` for the full story.
    if (isImeComposing(e.nativeEvent)) return;

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
        <CommandList
          groups={groups}
          activeIndex={activeIndex}
          itemCount={flatItems.length}
          onRun={runItem}
          onHover={handleHover}
        />

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
