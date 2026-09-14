/**
 * The one instruction the Agent tab exists to give: type `>` in the chat input.
 *
 * It replaced a textarea. A box in the sidebar looked like the place the agent lived,
 * when the agent has always run through the page's own composer — so the box had to
 * forward what you typed into that composer, and every failure mode of doing so (no chat
 * open, a task already holding the composer) surfaced as an error on a control that
 * looked like it should just work. Showing the composer instead of standing in for it
 * removes the indirection and the class of error that came with it.
 *
 * The three steps are drawn rather than described, because "type `>`" is a keystroke and a
 * picker, and a mock of both is read faster than a sentence about them.
 *
 * ## Why step 2 looks different
 *
 * Steps 1 and 3 are things the user already knows how to do — open a chat, type a request.
 * Step 2 is the only new information on this panel, and the only thing that will not
 * happen by accident. So it is the one that is set in the accent colour, a size up and
 * semibold, with a filled step badge; 1 and 3 stay muted. At a glance the panel reads as
 * "type `>`", with the other two steps as context.
 *
 * The emphasis is type and colour, not a filled band. A tint behind one of three steps
 * reads as a separate card wedged into a list and re-introduces the nested-box look this
 * panel was flattened to avoid.
 *
 * ## Flat, and only one padding
 *
 * No outlines: a sidebar this narrow puts every card edge within a few pixels of the next
 * one, and stacking outlined boxes turned the tab into a grid of competing frames.
 *
 * No wrapper surface either. These three steps used to sit on a tinted card with its own
 * `p-3`, inside the tab's `px-3` — two paddings on a panel about 300px wide, which reads
 * as cramped and buys nothing, since the steps are the only thing at that level anyway.
 * The only fills left are the two small mocks inside step 2, and those are drawings of the
 * page's composer and picker rather than decoration.
 */

import React from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';

interface LauncherCtaProps {
  /** Label of the auto entry, as it appears in the `>` picker. */
  entryTitle: string;
}

/** A step number. `accent` fills it, for the step that carries the actual instruction. */
const Step: React.FC<{ n: number; accent?: boolean }> = ({ n, accent }) => (
  <span
    className={cn(
      'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
      accent ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-muted-foreground',
    )}
  >
    {n}
  </span>
);

export const LauncherCta: React.FC<LauncherCtaProps> = ({ entryTitle }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      {/*
        Both sections in this tab carry their own label, in the same style, and each label
        sits tight against what it introduces — the air goes *above* a label, not below it,
        so a heading reads as belonging to the block under it rather than floating between
        two. `mb-2` here matches the examples' `mb-0.5 +` card padding.
      */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('agent.launcher.stepsTitle', { defaultValue: 'How to run it' })}
      </h3>

      {/* 1 — there has to be a chat open, since the composer is where this runs. The button
          that opens one is not here: it is a precondition both agents share, so it sits in
          the tab header above the switcher's panels rather than inside this list. */}
      <div className="flex items-start gap-2">
        <Step n={1} />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
          {t('agent.launcher.step1', { defaultValue: 'Open a chat — any chat.' })}
        </p>
      </div>

      {/* 2 — the keystroke, drawn: this is the whole point of the panel. It carries the
          emphasis in weight and colour, not in a filled band behind it. */}
      <div className="flex items-start gap-2">
        <Step n={2} accent />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-primary">
            {t('agent.launcher.step2', {
              defaultValue: 'Type > in its input box and pick the agent.',
            })}
          </p>

          <div className="mt-1.5 space-y-1">
            {/* the composer, with `>` just typed into it. These two tints draw a screenshot
                of the page's own UI, which is different from tinting for emphasis. */}
            <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1">
              <span className="font-mono text-xs font-semibold text-primary">&gt;</span>
              <span className="h-3 w-px animate-pulse bg-foreground/60" aria-hidden />
            </div>
            {/* the picker that opens under it, first row highlighted */}
            <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
              <Bot className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate text-xs font-medium text-foreground">{entryTitle}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 — the part that makes it useful: keep typing */}
      <div className="flex items-start gap-2">
        <Step n={3} />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
          {t('agent.launcher.step3', {
            defaultValue: 'Keep typing what you want done, then press Enter.',
          })}
        </p>
      </div>
    </div>
  );
};
