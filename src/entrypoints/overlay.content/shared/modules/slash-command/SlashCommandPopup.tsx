import React, { useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import type { SlashCommandMatch } from './types';
import { useI18n } from '@/shared/hooks/useI18n';
import { PromptIconDisplay } from '@/entrypoints/overlay.content/shared/modules/prompts/lib/prompt-icons';

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
      className="fixed z-[9999] min-w-[280px] max-w-[400px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
      style={{ bottom: position.bottom, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur on popup interaction
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-muted/30">
        <Zap className="h-3 w-3 text-primary" />
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
        {matches.map((match, index) => (
          <div
            key={match.prompt.id}
            ref={index === selectedIndex ? selectedRef : undefined}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
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
        ))}
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/50 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">↑↓</kbd>
          {' '}{t('slashCommand.navigate')}
        </span>
        <span className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">↵</kbd>
          {' '}{t('slashCommand.select')}
        </span>
        <span className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Esc</kbd>
          {' '}{t('slashCommand.dismiss')}
        </span>
      </div>
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
