import React, { useMemo } from 'react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useAppStore } from '@/shared/lib/store';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { navigateToGem, navigateToNotebook, navigateToNewChat } from '@/shared/lib/navigation';
import { GemPickerContent } from '../../shared/modules/gems/components/GemPickerContent';
import { NotebookPickerContent } from '../../shared/modules/notebooks/components/NotebookPickerContent';
import { SplitNewChatButton } from '@/shared/components/ui/split-new-chat-button';
import { useExplorerContext } from '../../shared/modules/explorer/ExplorerContext';
import { INBOX_FOLDER_ID } from '@/shared/constants/inbox';
import type { Gem, Notebook } from '@/shared/types/db';

interface NewChatButtonProps {
  onTemporaryChat?: () => void;
}

export const NewChatButton = ({ onTemporaryChat }: NewChatButtonProps) => {
  const { t } = useI18n();
  const {
    createPendingAndFocus,
    onNewChat: explorerNewChat,
    resolveNewChatFolder,
  } = useExplorerContext();

  const lastSelectedGemId = useSettingsStore((s) => s.lastSelectedGemId);
  const lastSelectedNotebookId = useSettingsStore((s) => s.lastSelectedNotebookId);
  const { gems, notebooks } = useAppStore();

  const lastGem = useMemo(
    () => (lastSelectedGemId ? gems.find((g) => g.id === lastSelectedGemId) : null),
    [gems, lastSelectedGemId],
  );
  const lastNotebook = useMemo(
    () => (lastSelectedNotebookId ? notebooks.find((n) => n.id === lastSelectedNotebookId) : null),
    [notebooks, lastSelectedNotebookId],
  );

  /**
   * Resolve the target folder for a new chat.
   * Priority (owned by the explorer, which holds the selection state):
   * selected folder → gem/notebook default folder → inbox.
   */
  const resolveTargetFolder = (gemId?: string | null, notebookId?: string | null): string =>
    resolveNewChatFolder?.(gemId, notebookId)
    ?? INBOX_FOLDER_ID(useAppStore.getState().ui.overlay.currentPlatform);

  // Middle click: always open a new chat in a new tab
  const handleNewChatInNewTab = () => {
    window.open('https://gemini.google.com/app', '_blank');
  };

  const handleNewChat = () => {
    // Use explorer's unified handler which creates pending entry,
    // expands the target folder, and navigates
    if (explorerNewChat) {
      explorerNewChat();
    } else {
      navigateToNewChat();
    }
  };

  const handleNewGemChat = async (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const gem = await usePopoverPickerStore.getState().open<Gem>({
      anchorRect: rect,
      content: <GemPickerContent lastSelectedGemId={lastSelectedGemId} />,
      width: 280,
    });
    if (gem) {
      const targetFolder = resolveTargetFolder(gem.id, null);
      createPendingAndFocus?.(targetFolder);
      navigateToGem(gem.id);
    }
  };

  const handleNewNotebookChat = async (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const notebook = await usePopoverPickerStore.getState().open<Notebook>({
      anchorRect: rect,
      content: <NotebookPickerContent lastSelectedNotebookId={lastSelectedNotebookId} />,
      width: 280,
    });
    if (notebook) {
      const targetFolder = resolveTargetFolder(null, notebook.id);
      createPendingAndFocus?.(targetFolder);
      navigateToNotebook(notebook.id);
    }
  };

  // Gem tooltip: explains left/right click behavior
  const gemTooltip = lastGem
    ? t('newChatButton.gemItemTooltipWithLast', { name: lastGem.name })
    : t('newChatButton.gemItemTooltip');

  // Notebook tooltip: explains left/right click behavior
  const notebookTooltip = lastNotebook
    ? t('newChatButton.notebookItemTooltipWithLast', { name: lastNotebook.name })
    : t('newChatButton.notebookItemTooltip');

  return (
    <div className="px-3 py-2">
      <SplitNewChatButton
        icon={<UIcon icon="tabler:message-plus" className="h-4 w-4" />}
        label={t('explorerHeader.newChat')}
        tooltip={onTemporaryChat ? t('tooltip.newChatCta') : t('tooltip.newChat')}
        onClick={handleNewChat}
        onContextMenu={onTemporaryChat ? () => onTemporaryChat() : undefined}
        onMiddleClick={handleNewChatInNewTab}
        dropdownTooltip={t('newChatButton.dropdownTooltip')}
        dropdownItems={[
          {
            label: t('newChatButton.newGemChat'),
            icon: <UIcon icon="tabler:diamond" className="h-4 w-4" />,
            tooltip: gemTooltip,
            // Left click: navigate to last gem, or open picker if no last gem
            onClick: (e) => {
              e.preventDefault();
              if (lastGem) {
                const targetFolder = resolveTargetFolder(lastGem.id, null);
                createPendingAndFocus?.(targetFolder);
                navigateToGem(lastGem.id);
              } else {
                handleNewGemChat(e);
              }
            },
            // Right click: always open popover picker
            onContextMenu: (e) => {
              e.preventDefault();
              handleNewGemChat(e);
            },
          },
          {
            label: t('newChatButton.newNotebookChat'),
            icon: <UIcon icon="tabler:notebook" className="h-4 w-4" />,
            tooltip: notebookTooltip,
            // Left click: navigate to last notebook, or open picker if none
            onClick: (e) => {
              e.preventDefault();
              if (lastNotebook) {
                const targetFolder = resolveTargetFolder(null, lastNotebook.id);
                createPendingAndFocus?.(targetFolder);
                navigateToNotebook(lastNotebook.id);
              } else {
                handleNewNotebookChat(e);
              }
            },
            // Right click: always open popover picker
            onContextMenu: (e) => {
              e.preventDefault();
              handleNewNotebookChat(e);
            },
          },
        ]}
      />
    </div>
  );
};
