/**
 * The worked examples — the Agent tab's answer to "what do I type".
 *
 * Each one is rendered as the thing you would actually see in the chat input: the
 * `>Better Sidebar Agent` capsule, then the sentence. Clicking stages exactly that,
 * unsent, in the chat input — the same place `>` puts you, so the sidebar teaches the one
 * entry point rather than becoming a second one.
 *
 * ## One at a time, and it moves on its own
 *
 * These were a stacked list of eight. None of them is short, which is right for the
 * content and wrong for a sidebar: the two destinations below fell off the bottom and the
 * panel read as a wall of text. So one is shown at a time.
 *
 * It advances by itself every {@link ROTATE_MS}, because a carousel that only moves when
 * you find its arrows shows most people exactly one example, and the seven they never see
 * are the ones that would have told them the agent also does prompts, snippets and files.
 * Rotation stops while the pointer is over it or focus is inside it — otherwise it would
 * pull the sentence out from under someone mid-read — and stays stopped while a task is
 * running, since nothing here is clickable then anyway.
 *
 * The examples stay long. Their length is the lesson: conditions, exceptions and "show me
 * before you touch anything" are what a first-time user does not think to ask for, and a
 * clamped preview would hide precisely that.
 *
 * ## Why all eight are in the DOM
 *
 * They are stacked in one grid cell, with only the current one visible. That makes the
 * box as tall as the longest example and *keeps* it that height, so the timer never
 * reflows the panel underneath it. Rendering one at a time meant the destinations below
 * jumped every few seconds — the one thing an auto-advancing carousel must not do.
 *
 * ⚠️ Nothing at rest says there are eight. There was an `n/8` counter, removed to keep the
 * header on one line; the rotation is what reveals the rest now.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderTree,
  HelpCircle,
  RefreshCw,
  Search,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { AGENT_EXAMPLES } from './agent-examples';

/** How long each example holds before the next one comes up. */
const ROTATE_MS = 7000;

const ICONS: Record<string, LucideIcon> = {
  FolderTree,
  Search,
  Download,
  RefreshCw,
  Wand2,
  Bookmark,
  FileText,
  BarChart3,
};

interface LauncherExamplesProps {
  /** Label shown on the capsule, i.e. the auto entry's title. */
  capsuleLabel: string;
  /** Stage this text in the chat input, behind the capsule, without sending. */
  onPick: (text: string) => void;
  disabled?: boolean;
}

export const LauncherExamples: React.FC<LauncherExamplesProps> = ({
  capsuleLabel,
  onPick,
  disabled,
}) => {
  const { t } = useI18n();

  const total = AGENT_EXAMPLES.length;
  const [index, setIndex] = useState(0);
  /** Pointer over the carousel, or focus inside it — either means someone is reading. */
  const [held, setHeld] = useState(false);

  const go = (delta: 1 | -1) => setIndex((i) => (i + delta + total) % total);

  /**
   * Auto-advance.
   *
   * Keyed on `index` as well as the pause conditions, so a manual click restarts the
   * countdown rather than leaving the next automatic move a fraction of a second away.
   */
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ).current;

  useEffect(() => {
    if (held || disabled || reduceMotion) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % total), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [index, held, disabled, reduceMotion, total]);

  const arrow =
    'absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full ' +
    'bg-background/95 text-muted-foreground shadow-[shadow:var(--shadow-popover)] ' +
    'opacity-0 transition-opacity hover:text-foreground ' +
    'group-hover:opacity-100 focus-visible:opacity-100 ' +
    // Invisible at rest, and out of the way: without this an arrow still swallows clicks
    // aimed at the card edge underneath it. Keyboard activation is unaffected.
    'pointer-events-none group-hover:pointer-events-auto focus-visible:pointer-events-auto';

  return (
    <div>
      {/* `mb-0.5`, not more: the card below adds `py-2` of its own, so anything larger
          here reads as a gap between the heading and the thing it names. */}
      <div className="mb-0.5 flex items-center gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('agent.launcher.examplesTitle', { defaultValue: 'Try asking for something like' })}
        </h3>
        {/* How to use these lives behind the question mark rather than under the card.
            It is read once and then never again, so standing copy for it would cost
            vertical space on every later visit. */}
        <SimpleTooltip
          content={t('agent.launcher.examplesHint', {
            defaultValue:
              'Click one to drop it into the chat input, then edit it before you send. The more specific you are, the less it has to guess.',
          })}
        >
          <button
            type="button"
            // Nothing happens on click; the tooltip opens on hover and on focus. A button
            // rather than a bare icon so it is reachable by keyboard at all.
            aria-label={t('agent.launcher.examplesHintLabel', {
              defaultValue: 'How these examples work',
            })}
            className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </SimpleTooltip>
      </div>

      {/*
        Arrows are positioned against this box, not the whole section, so they land on the
        card's centre line rather than up near the heading. `grid` with everything in
        row/col 1 is what fixes its height to the tallest example.
      */}
      <div
        className="group relative grid"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {AGENT_EXAMPLES.map((example, i) => {
          const Icon = ICONS[example.icon] ?? FileText;
          const label = t(`agent.launcher.examples.${example.key}.label`, {
            defaultValue: example.label,
          });
          const text = t(`agent.launcher.examples.${example.key}.text`, {
            defaultValue: example.text,
          });
          const active = i === index;

          return (
            // The card itself is the action: clicking anywhere on it stages the example.
            <button
              key={example.key}
              type="button"
              onClick={() => onPick(text)}
              disabled={disabled || !active}
              tabIndex={active ? undefined : -1}
              aria-hidden={!active}
              title={t('agent.launcher.examplePick', { defaultValue: 'Put this in the chat input' })}
              className={cn(
                // Same cell as its siblings, so the box is as tall as the longest of them.
                'col-start-1 row-start-1',
                // `-mx-2 px-2`: the tint only shows on hover, and when it does it bleeds
                // outward instead of indenting the text a second time inside the tab's px-3.
                '-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left',
                'transition-opacity duration-300',
                // One opacity class per state, never two: same-specificity utilities are
                // resolved by stylesheet order, not by the order they appear here.
                !active && 'pointer-events-none invisible opacity-0',
                active && disabled && 'cursor-not-allowed opacity-50',
                active && !disabled && 'opacity-100 hover:bg-accent/40',
              )}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate text-[13px] font-semibold text-foreground">{label}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                <span
                  className="mr-1 inline-flex items-center rounded bg-primary/10 px-1 py-px align-middle
                             text-[11px] font-medium text-primary"
                >
                  {`>${capsuleLabel}`}
                </span>
                {text}
              </p>
            </button>
          );
        })}

        {/* Siblings of the cards, not children — a button inside a button is invalid, and
            these have to stay usable while the card underneath is disabled. */}
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t('agent.launcher.examplePrev', { defaultValue: 'Previous example' })}
          className={cn(arrow, '-left-1')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('agent.launcher.exampleNext', { defaultValue: 'Next example' })}
          className={cn(arrow, '-right-1')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
