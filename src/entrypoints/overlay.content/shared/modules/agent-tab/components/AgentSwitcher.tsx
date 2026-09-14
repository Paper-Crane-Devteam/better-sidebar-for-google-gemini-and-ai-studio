/**
 * AgentSwitcher — which agent the Agent tab is showing.
 *
 * A segmented control rather than a dropdown: there are two agents, both fit, and the point
 * is that the user can see the other one exists. A dropdown would hide the Workspace agent
 * behind a click for everyone who never thinks to look.
 *
 * ⚠️ **Switching here does not switch a running session.** An agent is fixed for the life of
 * a session — the prompt was built from it and the tool layer enforces its permissions — so
 * while a task is live this only changes what the panel *shows*. The running agent's row is
 * marked so that difference is visible rather than surprising.
 */

import React from 'react';
import { Bot, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { listAgents } from '../../agent-loop/agents/registry';
import type { AgentId } from '../../agent-loop/agents/types';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';

/** Icons by name — see the same note in `AgentCommandPopup`. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  FolderOpen,
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
      className="flex gap-1 rounded-lg bg-muted/50 p-1"
      role="tablist"
      aria-label={t('agent.switcher.label', { defaultValue: 'Choose an agent' })}
    >
      {agents.map((agent) => {
        const Icon = ICONS[agent.icon] ?? Bot;
        const isSelected = agent.id === selected;
        const isRunning = running && agent.id === runningAgentId;

        return (
          <button
            key={agent.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            title={agent.description}
            onClick={() => onSelect(agent.id)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
              'text-xs font-medium transition-colors',
              isSelected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{agent.name}</span>
            {/* Only on the row that is actually working, and only while it is. */}
            {isRunning && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
};
