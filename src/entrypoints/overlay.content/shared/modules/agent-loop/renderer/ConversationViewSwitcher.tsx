/**
 * ConversationViewSwitcher — top-left control for choosing between the site's own
 * conversation DOM and the agent's rendered view.
 *
 * Deliberately a two-segment control rather than a single action button. The old
 * button labelled itself with the view you would *get* by pressing it while colouring
 * itself like a status badge, so "Agent 渲染" in green meant "you are currently NOT in
 * the agent view" — the exact opposite of how it read. Showing both views at once and
 * highlighting the active one removes the guesswork; the round counter and the pulsing
 * dot are gone too, since the dock already reports what the loop is doing.
 */

import React, { useEffect, useRef } from 'react';
import { useAgentLoopStore } from '../agent-loop-store';
import { useAgentViewStore } from '../agent-view-store';
import { useAgentViewState } from './useAgentViewState';
import { cn } from '@/shared/lib/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useAppStore } from '@/shared/lib/store';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';

type ViewMode = 'custom' | 'original';

/**
 * Distance from the top of the viewport to the top of this control, per platform.
 *
 * Gemini's conversation starts at the top of the window, so 12px sits it just inside.
 * AI Studio puts a 56px-tall `ms-header` above the chat — the prompt title, token count and
 * action icons — and the old shared 12px landed the switcher right on top of the title,
 * covering the start of it. 8px below the header keeps the control in the conversation area
 * it belongs to and leaves the title readable.
 *
 * A constant rather than a measurement: the header is a fixed-height toolbar, and watching
 * it would mean a ResizeObserver on native DOM for a couple of pixels of accuracy.
 */
const TOP_OFFSET_PX: Partial<Record<Platform, number>> = {
  [Platform.AI_STUDIO]: 64,
};
const DEFAULT_TOP_OFFSET_PX = 12;

/**
 * Hook to compute dynamic left offset for elements placed beside the sidebar.
 * Derived purely from Zustand stores (usePegasusStore & useAppStore).
 */
function useSidebarOffset(defaultOffset = 16) {
  const platform = detectPlatform();

  const aistudioWidth = usePegasusStore(
    (s) => s.enhancedFeatures.aistudio?.sidebarWidth ?? 320,
  );
  const geminiWidth = usePegasusStore(
    (s) => s.enhancedFeatures.gemini?.sidebarWidth ?? 320,
  );
  const isSidebarExpanded = useAppStore(
    (s) => s.ui.overlay.isSidebarExpanded,
  );

  let width = 320;
  if (platform === Platform.AI_STUDIO) {
    width = aistudioWidth;
  } else {
    width = isSidebarExpanded ? geminiWidth : 56;
  }

  return width + defaultOffset;
}

export const ConversationViewSwitcher: React.FC = () => {
  const { t } = useI18n();
  const viewMode = useAgentLoopStore((s) => s.viewMode);
  const setViewMode = useAgentLoopStore((s) => s.setViewMode);
  const { hasAgentContent, isRunning } = useAgentViewState();
  const leftPx = useSidebarOffset(16);
  const topPx = TOP_OFFSET_PX[detectPlatform()] ?? DEFAULT_TOP_OFFSET_PX;
  const conversationId = useCurrentConversationId();

  // Nothing to switch between on a plain conversation: the overlay has nothing to
  // render there, so a toggle would just blank the chat out.
  const shouldShow = hasAgentContent || isRunning;

  const override = useAgentViewStore((s) =>
    conversationId ? s.overrides[conversationId] : undefined,
  );
  const setOverride = useAgentViewStore((s) => s.setOverride);

  /**
   * The pick that was just made, held here as well as in the persisted store.
   *
   * The store can only key by conversation id, and there isn't always one: a chat
   * whose id hasn't appeared in the URL yet has none, and neither does one whose URL
   * shape we fail to read. `setOverride` then quietly does nothing, the effect below
   * re-derives 'custom' from the agent turns on the page, and the button reads as
   * dead — the click did land, it was just undone in the same commit.
   *
   * Scoped to the conversation it was made in, so it doesn't follow you elsewhere.
   */
  const manualRef = useRef<{ conversationId: string | null; mode: ViewMode } | null>(null);

  /**
   * Starting a task supersedes the pick, matching what `start()` does to the stored
   * override: "show me the raw DOM" was about reading history.
   *
   * Keyed off the idle → running transition rather than `isRunning`, so a pick made
   * *during* a run survives — watching the native turns stream in while the agent
   * works is a reasonable thing to want.
   */
  useEffect(() => {
    let wasIdle = useAgentLoopStore.getState().status === 'idle';
    return useAgentLoopStore.subscribe((s) => {
      const idle = s.status === 'idle';
      if (wasIdle && !idle) manualRef.current = null;
      wasIdle = idle;
    });
  }, []);

  /**
   * A pick made in a brand new chat belongs to whatever id the platform then hands
   * it, the same adoption `attachSessionConversation` does for the session. Declared
   * above the reconcile effect so the two agree within the same commit.
   */
  useEffect(() => {
    const pending = manualRef.current;
    if (!conversationId || !pending || pending.conversationId !== null) return;
    manualRef.current = { conversationId, mode: pending.mode };
    setOverride(conversationId, pending.mode);
  }, [conversationId, setOverride]);

  /**
   * Resolve the view from the conversation instead of resetting it on navigation.
   *
   * The old effect forced 'original' whenever the conversation id changed while
   * idle, which is also what happens on a reload (null → id) and on reopening an
   * old chat. So an agent conversation always came up as raw Gemini DOM and the user
   * had to press the toggle every single time, even though the page plainly contains
   * agent turns.
   *
   * Now the presence of agent content *is* the default, and only an explicit toggle
   * is remembered. `hasAgentContent` is in the deps for a reason: it starts false on
   * mount and turns true once the DOM has been parsed, a tick or two later.
   */
  useEffect(() => {
    const manual =
      manualRef.current?.conversationId === conversationId
        ? manualRef.current?.mode
        : undefined;
    const desired =
      manual ?? override ?? (hasAgentContent || isRunning ? 'custom' : 'original');
    if (viewMode !== desired) setViewMode(desired);
  }, [override, hasAgentContent, isRunning, viewMode, setViewMode, conversationId]);

  if (!shouldShow) {
    return null;
  }

  const active: ViewMode = viewMode === 'custom' ? 'custom' : 'original';

  const selectView = (next: ViewMode) => {
    if (next === active) return;
    manualRef.current = { conversationId, mode: next };
    setViewMode(next);
    // Only the persisted half needs an id — the pick itself always takes effect
    if (conversationId) setOverride(conversationId, next);
  };

  const options: { mode: ViewMode; label: string; hint: string }[] = [
    {
      mode: 'custom',
      label: t('agent.view.agent', { defaultValue: 'Agent' }),
      hint: t('agent.view.agentHint', {
        defaultValue: "The agent's steps and results, laid out to be readable",
      }),
    },
    {
      mode: 'original',
      label: t('agent.view.original', { defaultValue: 'Original' }),
      hint: t('agent.view.originalHint', {
        defaultValue: 'The conversation exactly as the site renders it',
      }),
    },
  ];

  return (
    <div
      className="fixed z-[60] transition-[left] duration-200 ease-out"
      style={{ left: `${leftPx}px`, top: `${topPx}px` }}
    >
      <div
        role="group"
        aria-label={t('agent.view.label', { defaultValue: 'Conversation view' })}
        className="flex items-center gap-1 rounded-full border border-border/60 bg-background/85 p-1 shadow-md backdrop-blur-md"
      >
        {options.map((option) => {
          const isActive = option.mode === active;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => selectView(option.mode)}
              title={option.hint}
              aria-pressed={isActive}
              className={cn(
                'cursor-pointer select-none rounded-full px-3 py-1 text-xs font-medium leading-4 transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
