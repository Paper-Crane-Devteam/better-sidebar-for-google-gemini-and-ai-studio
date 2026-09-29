/**
 * What `open_new_chat` is about to put in the new tab's input box.
 *
 * Shared by the two approval surfaces (the card and the dock), like `BrowserPlanPreview`,
 * so answering from either reads the same. The prompt *is* the decision here: it is the
 * whole hand-over the next conversation starts from, so it is shown verbatim — plain
 * pre-wrapped text rather than rendered markdown, because the composer will show the raw
 * characters and that is what the user is approving.
 */
import React from 'react';
import { useI18n } from '@/shared/hooks/useI18n';

export const NewChatPreview: React.FC<{ prompt?: string }> = ({ prompt }) => {
  const { t } = useI18n();
  const text = prompt?.trim();

  if (!text) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('agent.newChat.previewEmpty', {
          defaultValue: 'Opens an empty chat in a new tab.',
        })}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {t('agent.newChat.previewLabel', {
          defaultValue: 'Opens a new tab with this in the input box. Nothing is sent until you send it.',
        })}
      </p>
      <div className="max-h-[240px] overflow-y-auto rounded border border-border/40 bg-background/50 px-2.5 py-2">
        <pre className="whitespace-pre-wrap break-words font-sans text-xs text-foreground">{text}</pre>
      </div>
    </div>
  );
};
