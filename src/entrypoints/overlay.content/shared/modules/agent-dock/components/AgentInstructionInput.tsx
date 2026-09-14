/**
 * AgentInstructionInput — Footer input for nudging the AI mid-task.
 * The note is prepended to the next batch of tool results.
 * Enter to send, Shift+Enter for newline.
 */

import React, { useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAgentLoopStore } from '../../agent-loop/agent-loop-store';
import { isImeComposing } from '@/entrypoints/overlay.content/shared/lib/ime';

const MAX_LENGTH = 2000;

export const AgentInstructionInput: React.FC = () => {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const setPendingInstruction = useAgentLoopStore((s) => s.setPendingInstruction);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setPendingInstruction(trimmed);
    setValue('');
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter commits the IME candidate, not the instruction — see `isImeComposing`.
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder={t('agent.instruction.placeholder', {
            defaultValue: 'Add a note for the AI...',
          })}
          rows={1}
          className="w-full resize-none rounded-md border border-border/60 bg-muted/30 px-2 py-1
                     text-xs text-foreground placeholder:text-muted-foreground
                     transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {value.length > 1800 && (
          <span className="absolute bottom-1 right-2 text-xs text-muted-foreground">
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
      {sent && (
        <span className="mt-1 block text-xs text-success">
          ✓ {t('agent.instruction.sent', { defaultValue: 'Note sent' })}
        </span>
      )}
    </div>
  );
};
