/**
 * AgentLauncher — what you see in the Agent tab before anything is running.
 *
 * Replaces the old empty state, which only told you to type `>` in the chat
 * input and offered "Configure Agent" as its most prominent action. This is a
 * launcher: pick a skill, or describe a task, and it stages the agent in the
 * chat input for you.
 */

import React, { useState, useEffect } from 'react';
import { isChromeBuild } from '@/shared/browser-agent/contracts';
import { browserRequest, useBrowserAgent, initializeBrowserAgent } from '../../browser-agent/client';
import { BrowserAgentPanel } from '../../browser-agent/BrowserAgentPanel';
import { Bot, Keyboard, Lock, Send, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useLicenseStore } from '@/shared/lib/license-store';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { getAgentEntries, AGENT_AUTO_ID, BROWSER_AUTO_ID, browserEntryNeedsPermission } from '../../agent-loop/agent-entry';
import { agentEventBus } from '../../agent-loop/event-bus';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { getActiveEngine } from '../../agent-loop/engine/engine-registry';



export const AgentLauncher: React.FC = () => {
  const agentKind = useBrowserAgent(s => s.selected);
  useBrowserAgent(s => s.settings);
  useEffect(initializeBrowserAgent, []);
  const { t } = useI18n();
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const tier = useLicenseStore((s) => s.tier);
  const canWrite = tier === 'power_pack' || tier === 'pro' || tier === 'support_pack';

  const [task, setTask] = useState('');
  /** null = fine; otherwise why the last attempt didn't reach the chat input */
  const [unavailable, setUnavailable] = useState<
    'no-editor' | 'composer-busy' | 'session-busy' | null
  >(null);

  /**
   * A second task cannot start while one is live — `composeAndSend` refuses to build
   * a second engine, so a card that still looked clickable just staged a prompt the
   * send would then reject. Inert here, with a way out, instead.
   */
  const status = useAgentLoopStore((s) => s.status);
  const busy = status !== 'idle';

  const stopRunning = () => {
    const engine = getActiveEngine();
    if (engine) engine.stop();
    else useAgentLoopStore.getState().stop();
    setUnavailable(null);
  };

  const entries = getAgentEntries().filter(e => (e.agentKind ?? 'data') === agentKind);
  const autoId = agentKind === 'browser' ? BROWSER_AUTO_ID : AGENT_AUTO_ID;
  const autoEntry = entries.find((e) => e.id === autoId);
  const skillEntries = entries.filter((e) => e.id !== autoId);

  /**
   * Ask the platform feature to stage the entry. If nothing acknowledges within
   * a moment, the chat input isn't reachable (no chat open, or the feature is
   * turned off) — say so instead of failing silently.
   */
  const run = (entryId: string, userInput?: string, autoSend = false, onStaged?: () => void) => {
    if (browserEntryNeedsPermission(entryId)) {
      void browserRequest({ action: 'open-settings' });
      return;
    }
    setUnavailable(null);
    if (busy) {
      setUnavailable('session-busy');
      return;
    }

    let settled = false;
    const offStaged = agentEventBus.once('launcher:staged', () => {
      settled = true;
      onStaged?.();
    });
    const offFailed = agentEventBus.once('launcher:failed', ({ reason }) => {
      settled = true;
      setUnavailable(
        reason === 'composer-busy' || reason === 'session-busy' ? reason : 'no-editor',
      );
    });

    agentEventBus.emit('launcher:run-entry', { entryId, userInput, autoSend });

    setTimeout(() => {
      offStaged();
      offFailed();
      if (!settled) setUnavailable('no-editor');
    }, 1200);
  };

  const handleSubmitTask = () => {
    if (!task.trim() || !autoEntry) return;
    if (busy) {
      setUnavailable('session-busy');
      return;
    }
    // Only clear once the text actually reached the chat input — otherwise a
    // failed attempt (no chat open) would throw away what the user just typed.
    run(autoEntry.id, task, true, () => setTask(''));
  };

  /**
   * The agent runs through the page's chat input, so there has to be a chat open.
   * Offer that as a one-click action here rather than only telling the user about it.
   */
  const handleNewChat = () => {
    setUnavailable(null);
    navigateToNewChat();
  };

  const newChatButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-2 text-xs"
      onClick={handleNewChat}
    >
      <UIcon icon="tabler:message-plus" className="h-3 w-3" />
      {t('explorerHeader.newChat')}
    </Button>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      {isChromeBuild() && <label className="mb-3 flex items-center gap-2 text-xs">Agent
        <select aria-label="Agent" value={agentKind} disabled={busy} className="rounded border border-border bg-background px-2 py-1" onChange={e => useBrowserAgent.getState().select(e.target.value as 'data' | 'browser')}>
          <option value="data">Data Agent</option><option value="browser">Browser Agent</option>
        </select>
      </label>}
      {agentKind === 'browser' && <BrowserAgentPanel />}
      {/* Intro */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t('agent.launcher.title', { defaultValue: 'Agent' })}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {agentKind === 'browser' ? '整理 Chrome 标签页、标签组与收藏夹。' : t('agent.launcher.subtitle', {
              defaultValue: 'Team up with AI to manage your chats, prompts and data.',
            })}
          </p>
        </div>
      </div>

      {/* Free-form task */}
      <div className="mb-4">
        <div className="relative">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitTask();
              }
            }}
            rows={2}
            disabled={busy}
            placeholder={t('agent.launcher.placeholder', {
              defaultValue: 'Describe what you want to get done...',
            })}
            className="w-full resize-none rounded-md border border-border/60 bg-muted/30 px-3 py-2 pr-8
                       text-xs text-foreground placeholder:text-muted-foreground
                       focus:outline-none focus:ring-1 focus:ring-primary/50
                       disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSubmitTask}
            disabled={busy || !task.trim()}
            aria-label={t('agent.launcher.run', { defaultValue: 'Run' })}
            className="absolute right-2 top-2 rounded p-1 text-muted-foreground
                       hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {newChatButton}
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t('agent.launcher.newChatHint', {
              defaultValue: 'It runs in the chat you have open. Start a fresh one to keep it clean.',
            })}
          </span>
        </div>
      </div>

      {/* Skill cards */}
      <div className="mb-4 space-y-1">
        <span className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('agent.launcher.skills', { defaultValue: 'Or start with a skill' })}
        </span>
        <div className="space-y-1">
          {skillEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => run(entry.id)}
              disabled={busy}
              className="flex w-full items-start gap-3 rounded-md bg-muted/30 px-3 py-2
                         text-left transition-colors hover:bg-accent/40
                         disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{entry.title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {entry.description}
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          {t('agent.launcher.stageHint', {
            defaultValue:
              'Optional — just describe your task and the agent picks the right skill on its own. Pick one here and it fills the chat input, so you can still add your own details before sending.',
          })}
        </p>
      </div>

      {unavailable && (
        <div className="mb-4 space-y-2 rounded-md bg-orange-500/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {unavailable === 'composer-busy'
              ? t('agent.launcher.composerBusy', {
                  defaultValue:
                    'The running task has results waiting in the chat input. Send those first, then try again.',
                })
              : unavailable === 'session-busy'
                ? t('agent.launcher.sessionBusy', {
                    defaultValue:
                      'A task is already running. Finish it, or stop it, before starting another.',
                  })
                : t('agent.launcher.noEditor', {
                    defaultValue: 'Open a chat first — the agent runs through the chat input.',
                  })}
          </p>
          {unavailable === 'session-busy' && (
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={stopRunning}>
              {t('agent.launcher.stopRunning', { defaultValue: 'Stop the running task' })}
            </Button>
          )}
          {unavailable === 'no-editor' && newChatButton}
        </div>
      )}

      {/* Safety / tier note */}
      <div className="mt-auto space-y-2 pt-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Keyboard className="mt-1 h-3 w-3 shrink-0" />
          <span>
            {t('agent.launcher.triggerHint', {
              defaultValue: 'Typing > in the chat input starts the agent from there too.',
            })}
          </span>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-1 h-3 w-3 shrink-0" />
          <span>
            {agentKind === 'browser' ? '所有浏览器改动都需要批准，极速模式也不能跳过。' : t('agent.launcher.safety', {
              defaultValue:
                'Only your local database is touched. Changes are confirmed before they run.',
            })}
          </span>
        </div>

        {!canWrite && agentKind !== 'browser' && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="mt-1 h-3 w-3 shrink-0" />
            <span>
              {t('agent.launcher.freeTier', {
                defaultValue: 'Free plan is read-only. Upgrade to let the agent make changes.',
              })}
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={() => setSettingsOpen(true, 'agent')}
        >
          <Settings className="h-3 w-3" />
          {t('agent.launcher.manage', { defaultValue: 'Manage skills & tools' })}
        </Button>
      </div>
    </div>
  );
};
