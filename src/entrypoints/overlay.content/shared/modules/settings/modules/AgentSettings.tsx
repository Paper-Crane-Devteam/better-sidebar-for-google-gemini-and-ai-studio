/**
 * AgentSettings — one section per agent, plus the core tools.
 *
 * ## Why it is grouped by agent now
 *
 * It used to be one flat page: a skill list, then an MCP list. That worked while there was
 * one agent, and became actively misleading with two — a user looking at "Auto-Classify
 * Conversations" next to the file tools had no way to know the first can never use the
 * second, and turning something off had effects they could not predict.
 *
 * Grouping makes ownership the structure of the page rather than something to be inferred.
 * Each agent shows what it *is*, the tools it has, and the skills it can pull in.
 *
 * The core server (`complete_task`, `activate_skill`) sits on its own at the bottom with no
 * switch, because it belongs to every agent and a session that cannot end is not a
 * preference anyone should be able to express.
 */

import React from 'react';
import { Bot, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { cn } from '@/shared/lib/utils/utils';
import { useAgentConfigStore } from '../../agent-loop/agent-config-store';
import { listAgents } from '../../agent-loop/agents/registry';
import type { AgentDefinition, AgentId } from '../../agent-loop/agents/types';
import { getSkillsForAgent } from '../../agent-loop/skills/skill-registry';
import { mcpRegistry } from '../../agent-loop/mcp/registry';
import { CORE_MCP } from '../../agent-loop/mcp/core-mcp';
import { syncMCPEnabledState } from '../../agent-loop/mcp/setup';
import { openSkillEditorModal } from './agent/SkillEditorModal';
import { SwitchItem } from '../components/SwitchItem';

/** Icons by name — see the note in `AgentCommandPopup`. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  FolderOpen,
};

/** One tool, as a bullet under its server. */
const ToolRow: React.FC<{ name: string; description: string }> = ({ name, description }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="shrink-0 text-xs text-muted-foreground">{name}</span>
      <span className="truncate text-[10px] text-muted-foreground/60">
        — {t(`agent.mcp.tools.${name}`, { defaultValue: description.slice(0, 70) })}
      </span>
    </div>
  );
};

const AgentSection: React.FC<{ agent: AgentDefinition }> = ({ agent }) => {
  const { t } = useI18n();
  const {
    disabledMcpServers,
    disabledBuiltinSkills,
    toggleMcpServer,
    toggleBuiltinSkill,
    setCustomSkillEnabled,
    removeCustomSkill,
  } = useAgentConfigStore();

  const Icon = ICONS[agent.icon] ?? Bot;
  const servers = mcpRegistry.getAllServersForAgent(agent.id).filter((s) => s.id !== CORE_MCP.id);
  const skills = getSkillsForAgent(agent.id);

  /**
   * The registry keeps its own `enabled` flag, and prompt assembly reads the registry rather
   * than the store — so flipping a switch has to push the change through, or the tools stay
   * in the prompt until the next page load.
   */
  const handleToggleServer = (id: string) => {
    toggleMcpServer(id);
    syncMCPEnabledState();
  };

  const handleDeleteSkill = async (id: string, title: string) => {
    const confirmed = await modal.confirmDelete({
      title: t('agent.settings.deleteSkillTitle'),
      content: t('agent.settings.deleteSkillContent', { title }),
    });
    if (confirmed) removeCustomSkill(id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-foreground">{agent.name}</h4>
          <p className="text-xs text-muted-foreground">{agent.description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 text-xs"
          onClick={() => openSkillEditorModal({ agentId: agent.id })}
        >
          <Plus className="h-3 w-3" />
          {t('agent.settings.newSkill', { defaultValue: 'New skill' })}
        </Button>
      </div>

      {/* Tools */}
      <div className="space-y-2 pl-9">
        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">
            {t('agent.settings.noTools', { defaultValue: 'No optional tools.' })}
          </p>
        ) : (
          servers.map((server) => {
            const enabled = !disabledMcpServers.includes(server.id);
            return (
              <div key={server.id}>
                <SwitchItem
                  label={t(`agent.mcp.${serverKey(server.id)}.name`, {
                    defaultValue: server.name,
                  })}
                  description={`${t('agent.settings.mcpToolCount', { count: server.tools.length })} — ${t(
                    `agent.mcp.${serverKey(server.id)}.description`,
                    { defaultValue: server.description },
                  )}`}
                  checked={enabled}
                  onCheckedChange={() => handleToggleServer(server.id)}
                />
                {enabled && (
                  <div className="ml-8 space-y-1">
                    {server.tools.map((tool) => (
                      <ToolRow
                        key={tool.schema.name}
                        name={tool.schema.name}
                        description={tool.schema.description}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Skills */}
      <div className="space-y-1 pl-9">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          {t('agent.settings.skillsTitle')}
        </p>
        {skills.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">
            {/* An honest empty state: the Workspace agent genuinely has none yet, and its
                prompt says nothing about skills as a result. */}
            {t('agent.settings.noSkills', {
              defaultValue: 'No skills yet. This agent works from its own instructions.',
            })}
          </p>
        ) : (
          skills.map((skill) => (
            <div key={skill.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <SwitchItem
                  label={skill.title}
                  description={skill.description}
                  checked={skill.enabled}
                  onCheckedChange={() =>
                    skill.type === 'builtin'
                      ? toggleBuiltinSkill(skill.id)
                      : setCustomSkillEnabled(skill.id, !skill.enabled)
                  }
                />
              </div>
              {skill.type === 'custom' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => openSkillEditorModal({ skill })}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-destructive"
                    onClick={() => void handleDeleteSkill(skill.id, skill.title)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
        {/* Builtin skills are shown here too, so say why they cannot be deleted. */}
        {skills.some((s) => s.type === 'builtin') && (
          <p className="pt-1 text-[10px] text-muted-foreground/60">
            {t('agent.settings.builtinSkillNote', {
              defaultValue: 'Built-in skills can be switched off but not edited.',
            })}
          </p>
        )}
      </div>
    </div>
  );
};

/** `builtin-workspace` → `workspace`, so i18n keys read as `agent.mcp.workspace.name`. */
function serverKey(serverId: string): string {
  return serverId.replace(/^builtin-/, '');
}

export const AgentSettings: React.FC = () => {
  const { t } = useI18n();
  const agents = listAgents();

  return (
    <div className="relative space-y-6">
      <div>
        <h3 className="text-lg font-medium">
          {t('agent.settings.agentsTitle', { defaultValue: 'Agents' })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('agent.settings.agentsDesc', {
            defaultValue:
              'Each agent works on different things and has its own tools. Start one by typing > in the chat input.',
          })}
        </p>
      </div>

      {agents.map((agent, index) => (
        <React.Fragment key={agent.id}>
          {index > 0 && <Separator />}
          <AgentSection agent={agent} />
        </React.Fragment>
      ))}

      <Separator />

      {/* Shared, and not a switch. See the file header. */}
      <div className={cn('space-y-1')}>
        <h4 className="text-sm font-medium text-foreground">
          {t('agent.mcp.core.name', { defaultValue: CORE_MCP.name })}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('agent.mcp.core.description', {
            defaultValue: 'Available to every agent, and always on.',
          })}
        </p>
        <div className="ml-1 space-y-1 pt-1">
          {CORE_MCP.tools.map((tool) => (
            <ToolRow
              key={tool.schema.name}
              name={tool.schema.name}
              description={tool.schema.description}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export type { AgentId };
