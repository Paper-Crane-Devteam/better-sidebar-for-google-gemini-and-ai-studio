/**
 * The short requests, as chips.
 *
 * The carousel above teaches how much you *may* say; this says how little you *have* to. Both
 * are needed and they are not the same lesson — a panel showing only the long examples reads
 * as a form to fill in, and one showing only the short ones teaches that the agent takes
 * one-liners and nothing more.
 *
 * Wrapping chips rather than rows: these are three to six words each, and a full-width row per
 * phrase would spend six lines of a narrow panel on six short sentences. Clicking one stages
 * it in the chat input exactly as the examples do, so it is still a starting point to edit
 * rather than a command that fires.
 */

import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { BROWSER_PHRASES } from './browser-examples';

interface BrowserPhrasesProps {
  onPick: (text: string) => void;
  disabled?: boolean;
}

export const BrowserPhrases: React.FC<BrowserPhrasesProps> = ({ onPick, disabled }) => {
  const { t } = useI18n();

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('agent.browser.phrasesTitle', { defaultValue: 'Or just ask' })}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {BROWSER_PHRASES.map((phrase) => {
          const text = t(`agent.browser.phrases.${phrase.key}`, { defaultValue: phrase.text });
          return (
            <button
              key={phrase.key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              title={t('agent.launcher.examplePick', {
                defaultValue: 'Put this in the chat input',
              })}
              className={cn(
                'rounded-full bg-muted/50 px-2.5 py-1 text-left text-xs text-foreground transition-colors',
                disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent/50',
              )}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
};
