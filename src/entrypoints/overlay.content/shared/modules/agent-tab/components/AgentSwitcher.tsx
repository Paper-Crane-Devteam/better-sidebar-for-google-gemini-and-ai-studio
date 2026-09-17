/**
 * AgentSwitcher — which agent the Agent tab is showing.
 *
 * An accordion segmented control: the active agent smoothly expands to display its icon and
 * label, while inactive agents collapse into clean icon buttons with rich tooltips. This solves
 * the cramped width constraint in narrow sidebars while preserving instant discoverability
 * across all agents.
 *
 * ⚠️ Switching here changes the panel, not a running session. A running agent is indicated
 * with a spinning indicator even when unselected.
 */

import React from 'react';
import { Bot, FolderOpen, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { listAgents } from '../../agent-loop/agents/registry';
import type { AgentId } from '../../agent-loop/agents/types';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';

/** Icons by name — see the same note in `AgentCommandPopup`. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  FolderOpen,
  Globe,
};

interface AgentSwitcherProps {
  selected: AgentId;
  onSelect: (id: AgentId) => void;
}

export const AgentSwitcher: React.FC<AgentSwitcherProps> = ({ selected, onSelect }) => {
  const { t } = useI18n();
  const status = useAgentLoopStore((s) => s.status);
  const runningAgentId = useAgentLoopStore((s) => s.activeAgentId);
  const running = status !== 'idle';

  const agents = listAgents();

  return (
    <div
      className="flex items-center gap-1 rounded-lg bg-muted/50 p-1"
      role="tablist"
      aria-label={t('agent.switcher.label', { defaultValue: 'Choose an agent' })}
    >
      {agents.map((agent) => {
        const Icon = ICONS[agent.icon] ?? Bot;
        const isSelected = agent.id === selected;
        const isRunning = running && agent.id === runningAgentId;
        const displayName = agent.shortName ?? agent.name;

        const button = (
          <button
            key={agent.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(agent.id)}
            className={cn(
              'group relative flex h-7 items-center justify-center rounded-md transition-all duration-200 ease-out',
              isSelected
                ? 'flex-1 min-w-0 bg-background px-2.5 shadow-sm text-foreground gap-1.5 font-medium'
                : 'w-8 shrink-0 text-muted-foreground hover:bg-background/40 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:scale-105" />

            {/* Label and inline spinner for the selected tab */}
            {isSelected && (
              <>
                <span className="truncate text-xs animate-in fade-in-0 duration-150">
                  {displayName}
                </span>
                {isRunning && (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary ml-0.5 animate-in fade-in-0 duration-150" />
                )}
              </>
            )}

            {/* Pulsing indicator for an unselected agent actively running in the background */}
            {!isSelected && isRunning && (
              <span className="absolute top-1 right-1 flex h-1.5 w-1.5 pointer-events-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
            )}
          </button>
        );

        return button;
      })}
    </div>
  );
};
