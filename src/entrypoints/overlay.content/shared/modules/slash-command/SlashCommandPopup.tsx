import React, { useEffect, useRef } from 'react';
import { UIcon } from '@/shared/components/ui/icon';
import { cn } from '@/shared/lib/utils/utils';
import type { SlashCommandMatch } from './types';
import { useI18n } from '@/shared/hooks/useI18n';
import { PromptIconDisplay } from '@/entrypoints/overlay.content/shared/modules/prompts/lib/prompt-icons';
import { PopupFooterHints } from '@/entrypoints/overlay.content/shared/features/trigger-popup';
import { useAppStore } from '@/shared/lib/store';

interface SlashCommandPopupProps {
  matches: SlashCommandMatch[];
  selectedIndex: number;
  /** Highlight item on hover (keyboard-style selection visual) */
  onHighlight: (index: number) => void;
  /** Confirm selection on click */
  onConfirm: (index: number) => void;
  /** Position relative to viewport */
  position: { bottom: number; left: number };
  query: string;
}

/**
 * Popup that displays matching prompts from the prompt library.
 * Shows above the input field with keyboard navigation support.
 */
export const SlashCommandPopup: React.FC<SlashCommandPopupProps> = ({
  matches,
  selectedIndex,
  onHighlight,
  onConfirm,
  position,
  query,
}) => {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      // How the `>` trigger knows `/` is on screen and stands down — the two share an
      // editor, so without a marker to look for the mutual exclusion never fires.
      data-slash-command-popup=""
      className="fixed z-[9999] min-w-[280px] max-w-[400px] rounded-lg bg-popover shadow-[shadow:var(--shadow-popover)] overflow-hidden"
      style={{ bottom: position.bottom, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur on popup interaction
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/30">
        <UIcon icon="fluent-color:bot-sparkle-24" className="w-3 h-3" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {t('slashCommand.promptLibrary')}
        </span>
        {query && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {matches.length} {t('slashCommand.results')}
          </span>
        )}
      </div>

      {/* List */}
      <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
        {matches.length === 0 && !query ? (
          <EmptyLibraryState />
        ) : (
          matches.map((match, index) => (
            <div
              key={match.prompt.id}
              ref={index === selectedIndex ? selectedRef : undefined}
              className={cn(
                'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
              )}
              onClick={() => onConfirm(index)}
              onMouseEnter={() => onHighlight(index)}
            >
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-primary/10">
                <PromptIconDisplay name={match.prompt.icon || ''} className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  <HighlightedTitle
                    title={match.prompt.title}
                    ranges={match.matchRanges}
                  />
                </div>
              </div>
              {match.prompt.type === 'system' && (
                <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  SYS
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <PopupFooterHints />
    </div>
  );
};

/** Empty state shown when prompt library has no prompts */
const EmptyLibraryState: React.FC = () => {
  const { t } = useI18n();

  const handleGoToPrompts = () => {
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('prompts');
  };

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
      <UIcon icon="fluent-color:document-add-24" className="w-8 h-8 opacity-60" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t('slashCommand.emptyLibrary')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('slashCommand.emptyLibraryDesc')}
        </p>
      </div>
      <button
        className="mt-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        onClick={handleGoToPrompts}
      >
        {t('slashCommand.goToPrompts')}
      </button>
    </div>
  );
};

/** Renders title with highlighted matching characters */
const HighlightedTitle: React.FC<{
  title: string;
  ranges?: Array<[number, number]>;
}> = ({ title, ranges }) => {
  if (!ranges || ranges.length === 0) return <>{title}</>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const [start, end] of ranges) {
    if (start > lastEnd) {
      parts.push(title.slice(lastEnd, start));
    }
    parts.push(
      <span key={start} className="text-primary font-semibold">
        {title.slice(start, end)}
      </span>,
    );
    lastEnd = end;
  }

  if (lastEnd < title.length) {
    parts.push(title.slice(lastEnd));
  }

  return <>{parts}</>;
};
