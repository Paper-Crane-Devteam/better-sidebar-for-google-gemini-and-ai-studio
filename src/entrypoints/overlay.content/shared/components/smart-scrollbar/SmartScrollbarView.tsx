import React, { useRef, useEffect, useState } from 'react';
import { List } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Z_INDEX } from '@/shared/lib/z-index';
import { useI18n } from '@/shared/hooks/useI18n';
import { EraseMessagesButton } from './EraseMessagesButton';

/**
 * Maximum visible height for the dot container (px).
 * If dots exceed this, the container scrolls internally.
 */
const MAX_DOT_HEIGHT = 320;

/**
 * Max height for the expanded outline panel.
 */
const MAX_PANEL_HEIGHT = 420;

/** One clickable entry: a user question. */
export interface SmartScrollbarItem {
  id: string;
  content: string;
  /** Whether the item can be jumped to right now (its element is on the page) */
  available: boolean;
}

/**
 * Platform look. The colour tokens and `--radius` already follow the host page
 * through the shadow root's theme class; the variant covers shape and density —
 * Gemini's roomy floating card versus AI Studio's compact, flatter surface.
 */
export type SmartScrollbarVariant = 'gemini' | 'aistudio';

interface VariantStyles {
  panel: string;
  /** Width of the collapsed dot bar */
  collapsedWidth: string;
  /** Outline toggle button in the collapsed / expanded header */
  toggleCollapsed: string;
  toggleExpanded: string;
  icon: string;
  /** Clickable cell around each dot */
  dotCell: string;
  dot: string;
  dotActive: string;
  dotIdle: string;
  dotOff: string;
  /** Outline row: fixed pitch, and the highlighted block inside it */
  row: string;
  rowInner: string;
}

const VARIANT_STYLES: Record<SmartScrollbarVariant, VariantStyles> = {
  gemini: {
    panel: 'rounded-xl border-border/40 bg-background/80 backdrop-blur-xl shadow-lg shadow-black/5',
    collapsedWidth: 'w-8',
    toggleCollapsed: 'p-2',
    toggleExpanded: 'px-3 py-2',
    icon: 'h-4 w-4',
    dotCell: 'h-4 w-6',
    dot: 'rounded-full',
    dotActive: 'h-[10px] w-[10px] bg-primary',
    dotIdle: 'h-2 w-2 bg-muted-foreground/40 group-hover:bg-muted-foreground/80',
    dotOff: 'h-2 w-2 bg-muted-foreground/20',
    row: 'h-8 mx-1',
    rowInner: 'h-7 px-3 rounded-md',
  },
  aistudio: {
    // rounded-lg = --radius, which the AI Studio theme sets to 8px
    panel: 'rounded-lg border-border bg-background shadow-sm',
    collapsedWidth: 'w-6',
    toggleCollapsed: 'p-1.5',
    toggleExpanded: 'px-2.5 py-1.5',
    icon: 'h-3.5 w-3.5',
    dotCell: 'h-3.5 w-5',
    dot: 'rounded-full',
    dotActive: 'h-2 w-2 bg-primary',
    dotIdle: 'h-1.5 w-1.5 bg-muted-foreground/50 group-hover:bg-muted-foreground',
    dotOff: 'h-1.5 w-1.5 bg-muted-foreground/20',
    row: 'h-7 mx-1',
    rowInner: 'h-6 px-2 rounded-sm',
  },
};

interface Props {
  items: SmartScrollbarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Conversation is known but items are not ready yet: show placeholders */
  loading?: boolean;
  variant?: SmartScrollbarVariant;
  /**
   * Where to pin the bar. Omitted → right edge of the viewport, vertically
   * centred. Given → used as the fixed position (the bar still centres itself
   * on `top` via translate).
   */
  anchor?: { right: number; top: number };
  /**
   * Offer the "wipe stored messages" escape hatch. Only meaningful where the
   * items come from stored messages (Gemini); a DOM-fed bar has nothing to fix.
   */
  showErase?: boolean;
}

/**
 * SmartScrollbar UI — a minimal vertical dot bar on the right of the chat.
 * Each dot represents a user message.
 *
 * Interaction:
 * - Top: an outline icon button
 * - Click icon → expands from right-to-left into a wider panel showing
 *   truncated user questions. Hover shows full text, click navigates.
 * - Click icon again → collapses back to dot mode.
 * - The right edge stays anchored in both states.
 *
 * Purely presentational: platforms supply the items, the active id and the
 * jump action.
 */
export const SmartScrollbarView: React.FC<Props> = ({
  items,
  activeId,
  onSelect,
  loading = false,
  variant = 'gemini',
  anchor,
  showErase = true,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const styles = VARIANT_STYLES[variant];

  // Auto-scroll the dot container so the active dot stays visible
  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const el = activeRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

  return (
    <div
      className={cn(
        'fixed -translate-y-1/2 flex flex-col items-end',
        !anchor && 'right-4 top-1/2',
      )}
      style={{
        zIndex: Z_INDEX.SMART_SCROLLBAR,
        ...(anchor ? { right: anchor.right, top: anchor.top } : null),
      }}
    >
      <div
        className={cn(
          'flex flex-col border',
          styles.panel,
          // Only the width animates; height snaps instantly
          'transition-[width] duration-300 ease-out origin-right',
          'overflow-hidden',
          expanded ? 'w-[240px]' : styles.collapsedWidth,
          loading && 'opacity-40 pointer-events-none',
        )}
        style={{
          maxHeight: expanded ? `${MAX_PANEL_HEIGHT}px` : `${MAX_DOT_HEIGHT}px`,
        }}
      >
        {/* Header: outline toggle, plus the erase escape hatch. The erase button
            only exists in the expanded panel — the collapsed bar is 32px wide and
            a destructive control does not belong next to the dots people click
            constantly. */}
        <div
          className={cn(
            'flex shrink-0',
            expanded
              ? 'flex-row items-center border-b border-border/30'
              : 'flex-col items-center',
          )}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'flex items-center gap-2 min-w-0 flex-1',
              'transition-colors duration-150',
              'hover:bg-accent/60',
              expanded ? styles.toggleExpanded : cn(styles.toggleCollapsed, 'self-center'),
            )}
          >
            <List className={cn(styles.icon, 'shrink-0 text-muted-foreground')} />
            {expanded && (
              <span className="text-xs font-medium text-muted-foreground truncate animate-in fade-in duration-200">
                {t('smartScrollbar.topics')}
              </span>
            )}
          </button>

          {expanded && showErase && <EraseMessagesButton />}
        </div>

        {/* Content area */}
        {expanded ? (
          /* Expanded: list of user questions */
          <div
            ref={containerRef}
            className="flex flex-col overflow-y-auto overflow-x-hidden py-1"
            style={{
              maxHeight: `${MAX_PANEL_HEIGHT - 40}px`,
              scrollbarWidth: 'thin',
            }}
          >
            {loading ? (
              <DisabledPlaceholder />
            ) : (
              items.map((item, index) => {
                const isActive = item.available && item.id === activeId;
                return (
                  <OutlineItem
                    key={item.id}
                    item={item}
                    index={index}
                    isActive={isActive}
                    onSelect={onSelect}
                    styles={styles}
                    activeRef={isActive ? activeRef : undefined}
                  />
                );
              })
            )}
          </div>
        ) : (
          /* Collapsed: dot indicators */
          <div
            ref={containerRef}
            className="flex flex-col items-center gap-0 overflow-y-auto overflow-x-visible py-1"
            style={{
              maxHeight: `${MAX_DOT_HEIGHT - 40}px`,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {loading ? (
              <DisabledDots className={cn(styles.dot, styles.dotOff)} />
            ) : (
              items.map((item) => {
                const isActive = item.available && item.id === activeId;
                return (
                  <DotItem
                    key={item.id}
                    item={item}
                    isActive={isActive}
                    onSelect={onSelect}
                    styles={styles}
                    activeRef={isActive ? activeRef : undefined}
                  />
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────

interface DotItemProps {
  item: SmartScrollbarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  styles: (typeof VARIANT_STYLES)[SmartScrollbarVariant];
  activeRef?: React.Ref<HTMLDivElement>;
}

const DotItem: React.FC<DotItemProps> = ({
  item,
  isActive,
  onSelect,
  styles,
  activeRef,
}) => {
  return (
    <SimpleTooltip content={item.content} side="left" sideOffset={8} delayDuration={100}>
      <div
        ref={activeRef}
        onClick={() => item.available && onSelect(item.id)}
        className={cn(
          // shrink-0: the column is height-capped, and without it a long list
          // squeezes the rows until the dots touch instead of scrolling
          'group flex items-center justify-center shrink-0',
          styles.dotCell,
          'rounded-full',
          'transition-all duration-150',
          item.available ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <div
          className={cn(
            'transition-all duration-150',
            styles.dot,
            !item.available && 'opacity-30',
            isActive
              ? styles.dotActive
              : item.available
                ? styles.dotIdle
                : styles.dotOff,
          )}
        />
      </div>
    </SimpleTooltip>
  );
};

interface OutlineItemProps {
  item: SmartScrollbarItem;
  index: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  styles: VariantStyles;
  activeRef?: React.Ref<HTMLDivElement>;
}

const OutlineItem: React.FC<OutlineItemProps> = ({
  item,
  index,
  isActive,
  onSelect,
  styles,
  activeRef,
}) => {
  // Clean up whitespace for display (CSS handles truncation)
  const displayText = item.content.replace(/\s+/g, ' ').trim();

  const row = (
    <div
      ref={activeRef}
      onClick={() => item.available && onSelect(item.id)}
      className={cn(
        // Fixed row pitch: keeps the panel height independent of the
        // animating width, so expanding doesn't reflow (no height flicker)
        'group flex items-center shrink-0',
        styles.row,
        item.available ? 'cursor-pointer' : 'cursor-default opacity-50',
      )}
    >
      {/* Inner block is 4px shorter than the row, leaving breathing room
          without changing the overall list height */}
      <div
        className={cn(
          'flex items-center gap-2 w-full min-w-0',
          styles.rowInner,
          'transition-colors duration-150',
          isActive
            ? 'bg-primary/10 text-foreground'
            : 'group-hover:bg-accent/60 text-muted-foreground group-hover:text-foreground',
        )}
      >
        {/* Index indicator */}
        <span
          className={cn(
            'shrink-0 text-[10px] font-medium w-4 text-center rounded',
            isActive ? 'text-primary' : 'text-muted-foreground/60',
          )}
        >
          {index + 1}
        </span>
        {/* Content preview — single line, ellipsis on overflow */}
        <span className={cn('text-xs truncate min-w-0', isActive && 'font-medium')}>
          {displayText}
        </span>
      </div>
    </div>
  );

  return (
    <SimpleTooltip content={item.content} side="left" sideOffset={8} delayDuration={300}>
      {row}
    </SimpleTooltip>
  );
};

/** Placeholder dots shown while conversation is loading */
const DisabledDots: React.FC<{ className: string }> = ({ className }) => (
  <>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className={cn('my-1', className)} />
    ))}
  </>
);

/** Placeholder for expanded panel while loading */
const DisabledPlaceholder: React.FC = () => (
  <div className="px-3 py-2 text-xs text-muted-foreground/40">Loading...</div>
);
