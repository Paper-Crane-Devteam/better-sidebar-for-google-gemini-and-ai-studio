/**
 * Why the example did not land in the chat input, and the one action that fixes it.
 *
 * Paired with `useStageExample`, and shared for the same reason: the three problems are
 * properties of the composer, not of the agent whose panel asked. Each one gets an action
 * rather than only an explanation — "open a chat first" is a sentence the user has to act on,
 * so the button that acts on it belongs next to the sentence.
 *
 * `composer-busy` is the exception and stays text-only: the fix is to send what is already in
 * the composer, which only the user can decide to do.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigateToNewChat } from '@/shared/lib/navigation';
import type { StageProblem } from './useStageExample';

interface StageProblemNoticeProps {
  problem: StageProblem;
  onStopRunning: () => void;
  onDismiss: () => void;
}

export const StageProblemNotice: React.FC<StageProblemNoticeProps> = ({
  problem,
  onStopRunning,
  onDismiss,
}) => {
  const { t } = useI18n();
  if (!problem) return null;

  return (
    <div className="-mx-2 space-y-2 rounded-lg bg-orange-500/10 px-2 py-2">
      <p className="text-xs text-muted-foreground">
        {problem === 'composer-busy'
          ? t('agent.launcher.composerBusy', {
              defaultValue:
                'The running task has results waiting in the chat input. Send those first, then try again.',
            })
          : problem === 'session-busy'
            ? t('agent.launcher.sessionBusy', {
                defaultValue:
                  'A task is already running. Finish it, or stop it, before starting another.',
              })
            : t('agent.launcher.noEditor', {
                defaultValue: 'Open a chat first — the agent runs through the chat input.',
              })}
      </p>
      {problem === 'session-busy' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 bg-background/60 px-2 text-xs hover:bg-background"
          onClick={onStopRunning}
        >
          {t('agent.launcher.stopRunning', { defaultValue: 'Stop the running task' })}
        </Button>
      )}
      {problem === 'no-editor' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 bg-background/60 px-2 text-xs hover:bg-background"
          onClick={() => {
            onDismiss();
            navigateToNewChat();
          }}
        >
          <UIcon icon="tabler:message-plus" className="h-3 w-3" />
          {t('explorerHeader.newChat')}
        </Button>
      )}
    </div>
  );
};
