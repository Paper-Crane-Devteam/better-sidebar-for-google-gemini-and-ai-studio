/**
 * AgentSwitcher — which agent the Agent tab is showing.
 *
 * A dropdown. It was an accordion segmented control (selected agent expanded, the rest as
 * icon buttons), which held up at two and three agents; at four the collapsed icons were
 * the only thing telling them apart, and nobody reads a globe and a cursor as "Browser" and
 * "Web". A menu has room for the name *and* the one-line description, and keeps growing.
 *
 * The selection itself is persisted by `agent-config-store`, so a reload lands on the agent
 * the user last picked.
 *
 * ⚠️ Switching here changes the panel, not a running session. The running agent carries a
 * spinner in the trigger and in its menu row, even when another agent is selected.
 */

import React from 'react';
import { Bot, Check, ChevronDown, FolderOpen, Globe, Loader2, MousePointerClick } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { listAgents } from '../../agent-loop/agents/registry';
import type { AgentId } from '../../agent-loop/agents/types';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';

/** Icons by name — see the same note in `AgentCommandPopup`. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  FolderOpen,
  Globe,
  MousePointerClick,
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
  const current = agents.find((a) => a.id === selected) ?? agents[0];
  const CurrentIcon = ICONS[current.icon] ?? Bot;
  /** Something is running, but not the agent on screen. */
  const runningElsewhere = running && runningAgentId !== current.id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('agent.switcher.label', { defaultValue: 'Choose an agent' })}
          className="flex h-8 w-full items-center gap-2 rounded-lg bg-muted/50 px-2.5 text-left
                     transition-colors hover:bg-muted data-[state=open]:bg-muted"
        >
          <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {current.name}
          </span>
          {running && runningAgentId === current.id && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          )}
          {runningElsewhere && (
            <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]"
      >
        {agents.map((agent) => {
          const Icon = ICONS[agent.icon] ?? Bot;
          const isSelected = agent.id === selected;
          const isRunning = running && agent.id === runningAgentId;
          return (
            <DropdownMenuItem
              key={agent.id}
              onSelect={() => onSelect(agent.id)}
              className={cn('items-start gap-2 py-2', isSelected && 'bg-accent/50')}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-foreground">{agent.name}</span>
                  {isRunning && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {agent.description}
                </p>
              </div>
              {isSelected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
