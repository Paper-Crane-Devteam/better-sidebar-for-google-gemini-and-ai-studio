/**
 * AgentCommandPopup — the agent list, shown when `>` is typed.
 *
 * A flat list of agents. It used to be a two-level tree — "Better Sidebar Agent" as a root
 * with skills indented under it — and the indentation was carrying real meaning: the child
 * rows changed what the session would *do*, not just who ran it.
 *
 * Skills are gone from here now. What is left is one decision, and it is the only one the
 * user is better placed to make than the agent: **which of your things is this about.** So
 * both rows sit at the same level and the description is what distinguishes them, which is
 * why it is always visible instead of hiding in a tooltip.
 */

import React, { useRef } from 'react';
import { Bot, FolderOpen } from 'lucide-react';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import type { AgentEntry } from './agent-entry';
import { PopupFooterHints } from '@/entrypoints/overlay.content/shared/features/trigger-popup';

interface AgentCommandPopupProps {
  matches: AgentEntry[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onConfirm: (index: number) => void;
  position: { bottom: number; left: number };
  query: string;
}

/**
 * Icons, by name, for the agents that exist.
 *
 * A lookup rather than a dynamic import: there are two, they are in the bundle already, and
 * `lucide-react`'s dynamic form pulls the whole icon set into a content script that is
 * injected on every page load.
 */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  FolderOpen,
};

const AgentCommandItem: React.FC<{
  entry: AgentEntry;
  isSelected: boolean;
  onHighlight: () => void;
  onConfirm: () => void;
}> = ({ entry, isSelected, onHighlight, onConfirm }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const Icon = ICONS[entry.icon] ?? Bot;

  return (
    <div
      ref={rowRef}
      className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors ${
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
      onMouseEnter={onHighlight}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent blur
        onConfirm();
      }}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <OverflowTooltip
          content={entry.title}
          placement="right"
          offset={16}
          className="select-none text-sm font-medium text-foreground"
          hoverRef={rowRef}
          positionRef={rowRef}
        >
          {entry.title}
        </OverflowTooltip>
        {/* Always shown, not a tooltip: with two rows this line *is* the choice. */}
        <p className="mt-0.5 line-clamp-2 select-none text-[11px] leading-snug text-muted-foreground">
          {entry.description}
        </p>
      </div>
    </div>
  );
};

export const AgentCommandPopup: React.FC<AgentCommandPopupProps> = ({
  matches,
  selectedIndex,
  onHighlight,
  onConfirm,
  position,
  query,
}) => {
  if (matches.length === 0) return null;

  return (
    <div
      className="fixed z-[99999] max-w-[360px] min-w-[280px] overflow-hidden rounded-lg bg-popover shadow-[shadow:var(--shadow-popover)]"
      style={{
        bottom: `${position.bottom}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Agent</span>
        {query && (
          <span className="rounded bg-muted px-1 py-1 text-xs text-muted-foreground">
            {query}
          </span>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto py-1">
        {matches.map((entry, index) => (
          <AgentCommandItem
            key={entry.id}
            entry={entry}
            isSelected={index === selectedIndex}
            onHighlight={() => onHighlight(index)}
            onConfirm={() => onConfirm(index)}
          />
        ))}
      </div>

      <PopupFooterHints />
    </div>
  );
};
