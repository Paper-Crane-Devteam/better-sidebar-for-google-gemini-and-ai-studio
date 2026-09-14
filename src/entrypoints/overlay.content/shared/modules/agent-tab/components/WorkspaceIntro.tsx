/**
 * WorkspaceIntro — three lines above the file tree.
 *
 * The Workspace agent's panel is the file tree, which answers "what is in here" but not
 * "what is this and how do I use it". A user who switches to this agent and sees an empty
 * tree has no way to guess that the way in is typing `>Workspace` in the chat.
 *
 * Deliberately small and permanent rather than a dismissible onboarding card: it is two
 * sentences, it costs one line of vertical space next to a scrollable tree, and a card the
 * user dismissed six months ago is a card they cannot get back when they need it. The
 * details that would make it long — what formats are supported, how editing is approved —
 * sit behind the question mark instead.
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';

export const WorkspaceIntro: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="shrink-0 px-3 pt-3 pb-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-foreground">
          {t('agent.workspaceIntro.title', {
            defaultValue: 'Collaborate with AI on your Workspace documents',
          })}
        </h2>
        <button
          type="button"
          aria-label={t('agent.workspaceIntro.about', {
            defaultValue: 'About the workspace',
          })}
          className="shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          onClick={() => {
            modal.info({
              title: t('agent.workspaceIntro.howToUseTitle', {
                defaultValue: 'How to Use Workspace',
              }),
              content: (
                <div className="space-y-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {t('agent.workspaceIntro.howToUseContent')}
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
