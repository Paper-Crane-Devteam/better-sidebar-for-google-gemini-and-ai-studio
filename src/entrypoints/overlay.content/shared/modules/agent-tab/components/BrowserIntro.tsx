/**
 * BrowserIntro — the line above the Browser agent's panel.
 *
 * Same shape and the same reasoning as `WorkspaceIntro`: the panel below answers "what has
 * this agent got, and what has it done", but not "what is this and how do I start it". A user
 * who switches here and sees an empty journal has no way to guess that the way in is typing
 * `>Browser Agent` in the chat.
 *
 * Small and permanent rather than a dismissible card. The detail that would make it long —
 * which permissions mean what, why every change is approved separately — sits behind the
 * question mark, next to the permissions window that can actually change it.
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';

export const BrowserIntro: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="shrink-0 px-3 pt-3 pb-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-foreground">
          {t('agent.browserIntro.title', {
            defaultValue: 'Let AI tidy up your tabs and bookmarks',
          })}
        </h2>
        <button
          type="button"
          aria-label={t('agent.browserIntro.about', {
            defaultValue: 'About the Browser Agent',
          })}
          className="shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          onClick={() => {
            modal.info({
              title: t('agent.browserIntro.howToUseTitle', {
                defaultValue: 'How to Use Browser Agent',
              }),
              content: (
                <div className="space-y-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {t('agent.browserIntro.howToUseContent')}
                </div>
              ),
            });
          }}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
