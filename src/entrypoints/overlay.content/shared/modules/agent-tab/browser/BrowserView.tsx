/**
 * BrowserView — the Browser agent's panel in the Agent tab.
 *
 * ## What it used to be, and why that was wrong
 *
 * It opened on a paragraph of the agent's own terms and conditions — every change is approved,
 * here are the capability groups you granted, here is whether URLs are redacted, the audit
 * record stays local — and under that, a record list that unfolded into two snapshot trees in
 * place.
 *
 * Every sentence of that was true and none of it was what the user had come for. Someone who
 * has just switched to this agent has one question, "what do I type", and the panel answered
 * a different one: "what are the terms". The permission state is a thing you check once, when
 * you are about to change it, and there is a window for exactly that — so it lives behind the
 * button that opens it. The records are the same: a thing you go looking for, not a thing you
 * read on arrival, and they need more width than a sidebar has (see `BrowserRecordsModal`).
 *
 * So the panel is now shaped like the Better Sidebar agent's, because they have the same job:
 * how to start, a carousel of worked examples, the short requests, and then the two places you
 * go that are not a task. The two agents differing in shape was never a decision, only the
 * order they were built in.
 *
 * ⚠️ **The journal is still the reason this panel is not optional.** Tabs and bookmarks are
 * not versioned and not diffable: once a batch lands, the state the extension kept is the only
 * record it happened and the only route back. Moving it into a dialog changed where it is
 * reached from, not how important it is — hence a real button rather than a text link.
 */

import React from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { openBrowserAgentSettings } from '../../agent-loop/browser/browser-store';
import { LauncherCta } from '../components/LauncherCta';
import { LauncherExamples } from '../components/LauncherExamples';
import { StageProblemNotice } from '../components/StageProblemNotice';
import { useStageExample } from '../components/useStageExample';
import { BROWSER_EXAMPLES } from './browser-examples';
import { BrowserPhrases } from './BrowserPhrases';
import { openBrowserRecordsModal } from './BrowserRecordsModal';

export const BrowserView: React.FC = () => {
  const { t } = useI18n();
  const { entryTitle, stage, problem, clearProblem, busy, stopRunning } = useStageExample(
    'browser',
    t('agent.agents.browser.name', { defaultValue: 'Browser Agent' }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-3">
      <LauncherCta entryTitle={entryTitle} />

      <StageProblemNotice problem={problem} onStopRunning={stopRunning} onDismiss={clearProblem} />

      <LauncherExamples
        capsuleLabel={entryTitle}
        onPick={stage}
        disabled={busy}
        examples={BROWSER_EXAMPLES}
        i18nPrefix="agent.browser.examples"
      />

      <BrowserPhrases onPick={stage} disabled={busy} />

      {/*
        Buttons, not the underlined links these were. Both open a window, which is what a
        button means here and what a link in a paragraph did not — the records link in
        particular used to load a list *into this panel*, so it looked like a disclosure
        triangle and behaved like one.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void openBrowserAgentSettings().catch((e: Error) => toast.error(e.message))
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('agent.browser.panel.openSettings', { defaultValue: 'Permissions and privacy' })}
        </Button>
        <Button variant="outline" size="sm" onClick={openBrowserRecordsModal}>
          <History className="h-3.5 w-3.5" />
          {t('agent.browser.panel.viewHistory', { defaultValue: 'Local records' })}
        </Button>
      </div>
    </div>
  );
};
