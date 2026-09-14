import React from 'react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { SplitNewChatButton } from '@/shared/components/ui/split-new-chat-button';
import { navigateToAiStudioNewChat } from '../lib/temporary-chat';

interface NewChatButtonProps {
  onTemporaryChat?: () => void;
}

export const NewChatButton = ({ onTemporaryChat }: NewChatButtonProps) => {
  const { t } = useI18n();

  const handleNewChatInNewTab = () => {
    window.open('https://aistudio.google.com/prompts/new_chat', '_blank');
  };

  return (
    <div className="px-3 py-2">
      <SplitNewChatButton
        icon={<UIcon icon="tabler:message-plus" className="h-4 w-4" />}
        label={t('explorerHeader.newChat')}
        tooltip={
          onTemporaryChat ? t('tooltip.newChatCtaAiStudio') : t('tooltip.newChat')
        }
        onClick={navigateToAiStudioNewChat}
        onContextMenu={onTemporaryChat ? () => onTemporaryChat() : undefined}
        onMiddleClick={handleNewChatInNewTab}
      />
    </div>
  );
};
