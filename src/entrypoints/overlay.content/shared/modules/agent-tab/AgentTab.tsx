/**
 * AgentTab — the Agent sidebar tab. One agent at a time.
 *
 * ## What this tab is for, after two rewrites
 *
 * It used to swap between a launcher and a live status panel, which put every decision the
 * loop needed behind "sidebar open" *and* "Agent tab selected". Those moved to `agent-dock`,
 * docked to the composer where the answer gets typed and reachable with the sidebar shut.
 *
 * Then the workspace arrived as a *sub-view* of the launcher, reached through a row you had
 * to know to click, with a back arrow to get out. That was the wrong shape: the files are not
 * a detail of the conversation agent, they are what a different agent works on.
 *
 * So the tab is now **one panel per agent**, chosen by the switcher at the top:
 *
 * | Agent | Panel |
 * |---|---|
 * | Better Sidebar | the launcher — what this is, how to start, examples |
 * | Workspace | a short intro, then the file tree itself |
 *
 * ⚠️ **The switcher changes the panel, not a running session.** An agent is fixed for the
 * life of a session (the prompt was built from it, and the tool layer enforces its
 * permissions), so a task started as Workspace keeps running as Workspace no matter what is
 * on screen. The switcher marks the running one so that is visible.
 *
 * The selection is persisted, unlike the old view flag. Someone reviewing a document in the
 * workspace should not be dropped back on the conversation agent by a page reload.
 */

import React from 'react';
import { AgentLauncher } from './components/AgentLauncher';
import { AgentSwitcher } from './components/AgentSwitcher';
import { WorkspaceIntro } from './components/WorkspaceIntro';
import { WorkspaceView } from './workspace/WorkspaceView';
import { useAgentConfigStore } from '../agent-loop/agent-config-store';
import { getAgent, normalizeAgentId } from '../agent-loop/agents/registry';
import { SplitNewChatButton } from '@/shared/components/ui/split-new-chat-button';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigateToNewChat } from '@/shared/lib/navigation';
import { BrowserAgentLauncher } from '../browser-agent/BrowserAgentLauncher';

export const AgentTab: React.FC = () => {
  const { t } = useI18n();
  const selectedAgentId = useAgentConfigStore((s) => normalizeAgentId(s.selectedAgentId));
  const setSelectedAgentId = useAgentConfigStore((s) => s.setSelectedAgentId);
  const agent = getAgent(selectedAgentId);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-transparent to-primary/[0.02]">
      {/*
        The switcher sits outside the panels and never scrolls away. Both panels are
        scrollable and the workspace one owns its whole height, so a switcher inside either
        of them would either scroll out of reach or have to be duplicated.
      */}
      <div className="shrink-0 space-y-2 px-3 pt-3">
        {/*
          "Open a chat first" is a precondition for *both* agents — they run through the
          page's composer, not the sidebar — so the action that satisfies it belongs to the
          tab, not to one panel's step list. It used to live inside the Better Sidebar
          launcher's step 1, which meant the Workspace panel had no way to open a chat at
          all. Its own row, full width, so it stays a decision rather than a footnote.

          Above the switcher, not below: it is the step that comes first in time, and it
          applies to both segments — sitting under them would read as belonging to whichever
          one is selected.
        */}
        <SplitNewChatButton
          icon={<UIcon icon="tabler:message-plus" className="h-4 w-4" />}
          label={t('explorerHeader.newChat')}
          tooltip={t('tooltip.newChat')}
          onClick={navigateToNewChat}
        />
        <AgentSwitcher selected={selectedAgentId} onSelect={setSelectedAgentId} />
      </div>

      {agent.tabContent === 'browser' ? <BrowserAgentLauncher /> : agent.tabContent === 'workspace' ? (
        // `min-h-0` is what lets the file tree scroll instead of pushing the flex parent
        // past the viewport — without it the tree grows and the switcher slides off screen.
        <div className="flex min-h-0 flex-1 flex-col">
          <WorkspaceIntro />
          <div className="min-h-0 flex-1">
            {/* No `onBack`: the switcher above is the way out. */}
            <WorkspaceView />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <AgentLauncher />
        </div>
      )}
    </div>
  );
};
