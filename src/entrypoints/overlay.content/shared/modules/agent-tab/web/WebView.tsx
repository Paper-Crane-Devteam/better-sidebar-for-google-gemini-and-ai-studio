/**
 * WebView — the Web Agent's panel in the Agent tab.
 *
 * It used to fall through to the Better Sidebar launcher, so the Web Agent tab talked about
 * chats, prompts and folders. Same shape as the Browser panel now — how to start, examples,
 * then the places you go — plus the one thing this agent has that the others do not: it runs
 * in Chrome's side panel, so there is a button that opens it. Before, the only ways in were
 * sending a `>Web Agent` message or the page's right-click menu.
 *
 * Inside the side panel itself the button is hidden; you are already there.
 */

import React from 'react';
import { PanelRight, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useLicenseStore } from '@/shared/lib/license-store';
import { Button } from '@/shared/components/ui/button';
import { isPanelFrame } from '@/shared/web-agent/contracts';
import {
  openWebAgentConsent,
  openWebPanel,
  useWebAgent,
  webAgentBlocker,
} from '../../agent-loop/web/web-store';
import { DestinationRow } from '../components/DestinationRow';
import { LauncherCta } from '../components/LauncherCta';
import { LauncherExamples } from '../components/LauncherExamples';
import { StageProblemNotice } from '../components/StageProblemNotice';
import { useStageExample } from '../components/useStageExample';
import { WEB_EXAMPLES } from './web-examples';

export const WebView: React.FC = () => {
  const { t } = useI18n();
  const { entryTitle, stage, problem, clearProblem, busy, stopRunning } = useStageExample(
    'web',
    t('agent.agents.web.name', { defaultValue: 'Web Agent' }),
  );
  // Subscribed only so the blocker below re-evaluates when either gate changes.
  useLicenseStore((s) => s.tier);
  useWebAgent((s) => s.consented && s.permitted);
  const blocker = webAgentBlocker();
  const inPanel = isPanelFrame();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-3">
      <div className="space-y-2">
        <h2 className="text-[13px] font-medium text-foreground">
          {t('agent.webPanel.title', {
            defaultValue: 'Let AI read and operate web pages for you',
          })}
        </h2>
        {!inPanel && (
          <Button size="sm" className="w-full gap-1.5" onClick={openWebPanel}>
            <PanelRight className="h-3.5 w-3.5" />
            {t('agent.web.openPanel', { defaultValue: 'Open side panel' })}
          </Button>
        )}
        {blocker && (
          <button
            type="button"
            onClick={blocker.resolve}
            className="w-full text-left text-[11px] leading-relaxed text-muted-foreground hover:text-foreground"
          >
            {blocker.reason}
          </button>
        )}
      </div>

      <LauncherCta entryTitle={entryTitle} />

      <StageProblemNotice problem={problem} onStopRunning={stopRunning} onDismiss={clearProblem} />

      <LauncherExamples
        capsuleLabel={entryTitle}
        onPick={stage}
        disabled={busy}
        examples={WEB_EXAMPLES}
        i18nPrefix="agent.webPanel.examples"
      />

      <div className="space-y-1.5">
        <DestinationRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label={t('agent.webPanel.riskNotice', { defaultValue: 'Risk notice and permission' })}
          onClick={() => void openWebAgentConsent()}
        />
      </div>
    </div>
  );
};
