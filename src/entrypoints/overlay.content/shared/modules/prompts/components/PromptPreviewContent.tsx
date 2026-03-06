import React from 'react';
import { Label } from '@/shared/components/ui/label';
import { useI18n } from '@/shared/hooks/useI18n';
import { PromptIconDisplay } from '../lib/prompt-icons';
import type { Prompt } from '@/shared/types/db';

interface PromptPreviewContentProps {
  prompt: Prompt;
}

export const PromptPreviewContent = ({ prompt }: PromptPreviewContentProps) => {
  const { t } = useI18n();
  const typeLabel =
    prompt.type === 'system'
      ? t('prompts.systemPrompt')
      : t('prompts.normalPrompt');
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1">
          <Label className="text-muted-foreground text-sm">
            {t('prompts.type')}
          </Label>
          <div className="text-sm capitalize flex items-center gap-1">
            {prompt.icon && (
              <PromptIconDisplay name={prompt.icon} className="h-4 w-4" />
            )}
            {typeLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-1 min-w-0">
        <Label className="text-muted-foreground text-sm">
          {t('prompts.content')}
        </Label>
        <div className="p-3 rounded-md bg-muted/50 whitespace-pre-wrap break-all font-mono text-sm w-full">
          {prompt.content}
        </div>
      </div>
    </div>
  );
};
