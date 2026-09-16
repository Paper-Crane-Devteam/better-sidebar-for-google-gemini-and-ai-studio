import React from 'react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { SplitNewChatButton } from '@/shared/components/ui/split-new-chat-button';
import { navigateToAiStudioNewChat } from '../lib/temporary-chat';
import { useExplorerContext } from '../../shared/modules/explorer/ExplorerContext';

interface NewChatButtonProps {
  onTemporaryChat?: () => void;
}

export const NewChatButton = ({ onTemporaryChat }: NewChatButtonProps) => {
  const { t } = useI18n();
  const { onNewChat: explorerNewChat } = useExplorerContext();

  const handleNewChatInNewTab = () => {
    window.open('https://aistudio.google.com/prompts/new_chat', '_blank');
  };

  /**
   * Go through the explorer's handler so the pending entry gets created in the
   * resolved target folder. The explorer calls navigateToAiStudioNewChat itself
   * (wired via moduleConfig.explorer.onNewChat); the direct call is only a
   * fallback for when this button renders outside the explorer context.
   */
  const handleNewChat = () => {
    if (explorerNewChat) {
      explorerNewChat();
    } else {
      navigateToAiStudioNewChat();
    }
  };

  return (
    <div className="px-3 py-2">
      <SplitNewChatButton
        icon={<UIcon icon="tabler:message-plus" className="h-4 w-4" />}
        label={t('explorerHeader.newChat')}
        tooltip={
          onTemporaryChat ? t('tooltip.newChatCtaAiStudio') : t('tooltip.newChat')
        }
        onClick={handleNewChat}
        onContextMenu={onTemporaryChat ? () => onTemporaryChat() : undefined}
        onMiddleClick={handleNewChatInNewTab}
      />
    </div>
  );
};
