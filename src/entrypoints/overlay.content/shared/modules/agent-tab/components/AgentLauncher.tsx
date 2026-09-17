/**
 * AgentLauncher — the Agent tab before anything is running.
 *
 * It is no longer a launcher in the sense of a second place to start a task. It had a
 * textarea and a list of skill cards, which made the sidebar an entry point competing
 * with `>` in the chat input: the same action, reached two ways, with the sidebar one
 * having to forward text into the composer and report every way that can fail. The skill
 * list was the same duplication one level down — the `>` picker already lists skills, and
 * the auto entry picks one for you, so choosing here bought nothing and implied the
 * choice mattered.
 *
 * What is left reads top to bottom as one thought: how to start (`LauncherCta`), what to
 * say (`LauncherExamples`), and then the two places you go that are not a task. The
 * destinations sit last because they are only interesting once the first two have been
 * read; workspace leads within them, because looking at files is something you do
 * repeatedly and configuring tools is something you do once.
 *
 * The examples still stage into the chat input, so the entry point stays single — the
 * sidebar fills the composer and hands it back, rather than sending on its own.
 *
 * ## One padding, no outlines
 *
 * The tab owns the horizontal padding (`px-3`) and nothing inside adds a second one.
 * Sections are text on the panel; where a tinted surface is needed it uses `-mx-2 px-2`,
 * so the tint bleeds outward and the content stays on the same left edge as everything
 * above it. Before that rule, each section sat on a filled card with its own `p-3` inside
 * the tab's, and on a panel this narrow the doubled inset cost most of a line's width and
 * read as clutter.
 *
 * Nothing is outlined either — an earlier pass bordered every block and the tab became
 * nested frames a few pixels apart. Same reason the two destinations are full-width rows
 * instead of a two-column grid: side by side, each got about twenty characters of width
 * and both labels wrapped.
 *
 * With no frames left, the sections are told apart by the space between them alone, which
 * is why the column gap is a deliberate `gap-6` rather than the `gap-3` that looked fine
 * while every block still had an edge to hold it in. The two content sections label
 * themselves and keep that label tight against their own content, so the gap here always
 * reads as "new section" rather than as air between a heading and what it introduces.
 */

import React from 'react';
import { ChevronRight, Lock, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useLicenseStore } from '@/shared/lib/license-store';
import { LauncherCta } from './LauncherCta';
import { LauncherExamples } from './LauncherExamples';
import { StageProblemNotice } from './StageProblemNotice';
import { useStageExample } from './useStageExample';

/** A full-width destination row: icon, label, one line of explanation. */
const DestinationRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    // Same `-mx-2 px-2` band as everything else tinted here: the surface bleeds outward
    // rather than indenting its contents inside the tab's own padding.
    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg bg-muted/40 px-2 py-2
               text-left transition-colors hover:bg-accent/40"
  >
    <span className="shrink-0 text-primary">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-medium text-foreground">{label}</span>
      <span className="block truncate text-xs text-muted-foreground">{hint}</span>
    </span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
  </button>
);

export const AgentLauncher: React.FC = () => {
  const { t } = useI18n();
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const tier = useLicenseStore((s) => s.tier);
  const canWrite = tier === 'power_pack' || tier === 'pro' || tier === 'support_pack';

  /**
   * This panel belongs to the Better Sidebar agent specifically.
   *
   * Not "whichever agent is selected": the Workspace and Browser agents have their own
   * panels, so the only agent that reaches this code is this one. Naming it explicitly is
   * what makes the examples and the `>` label below correct — they have to quote the marker
   * the user will actually type.
   */
  const { entryTitle, stage, problem, clearProblem, busy, stopRunning } = useStageExample(
    'bettersidebar',
    t('agent.agents.bettersidebar.name', { defaultValue: 'Better Sidebar' }),
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-3">
      {/*
        Title row. What this is and what it may touch both sit behind the question mark:
        the pitch is read once, the safety note is reassurance rather than instruction, and
        neither earns standing space above the thing they describe.
      */}
      <div>
        <h2 className="text-[13px] font-medium text-foreground">
          {t('agent.launcher.subtitle', {
            defaultValue: 'Team up with AI to manage your chats, prompts and data.',
          })}
        </h2>
      </div>

      <LauncherCta entryTitle={entryTitle} />

      <StageProblemNotice problem={problem} onStopRunning={stopRunning} onDismiss={clearProblem} />

      <LauncherExamples capsuleLabel={entryTitle} onPick={stage} disabled={busy} />

      {/*
        Settings is the only destination left here. The workspace used to be a row in this
        list — a sub-view of this panel, reached by a click you had to know about. It is a
        whole agent now, one tap away in the switcher above, so a row pointing at it would
        be a second entrance to the same place with worse framing.
      */}
      <div className="space-y-1.5">
        <DestinationRow
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label={t('agent.launcher.manage', { defaultValue: 'Skills & tools' })}
          hint={t('agent.launcher.manageHint', { defaultValue: 'What it may do, and when to ask' })}
          onClick={() => setSettingsOpen(true, 'agent')}
        />
      </div>

      {/*
        The read-only note stays on the panel rather than moving into the tooltip with the
        safety copy: it is a limit the user will otherwise discover halfway through a task,
        and it is the one line here that asks them to do something.
      */}
      {!canWrite && (
        <div className="mt-auto flex items-start gap-2 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {t('agent.launcher.freeTier', {
              defaultValue: 'Free plan is read-only. Upgrade to let the agent make changes.',
            })}
          </span>
        </div>
      )}
    </div>
  );
};
