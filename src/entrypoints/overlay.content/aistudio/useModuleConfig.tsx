import { navigate } from '@/shared/lib/navigation';
import type { ExplorerTypeFilter } from '../shared/types/filter';
import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { NewChatButton } from './components/NewChatButton';
import {
  navigateToAiStudioNewChat,
  startAiStudioTemporaryChat,
} from './lib/temporary-chat';
import { ImportHistoryDialog } from './modules/search/components/ImportHistoryDialog';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Upload } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import type { ModuleConfig } from '../shared/types/moduleConfig';
import { handleSearchNavigation } from '../shared/utils';
import { toast } from '@/shared/lib/toast';

const ImportHistoryButton = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { t } = useI18n();

  return (
    <>
      <SimpleTooltip content={t('menu.importHistory')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setIsOpen(true)}
        >
          <Upload className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
      <ImportHistoryDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

const AISTUDIO_SYSTEM_KEY = 'aistudio_all_system_instructions';

interface AiStudioSystemItem {
  title?: string;
  text?: string;
}

export const useModuleConfig = (): ModuleConfig => {
  const { setOverlayOpen, createPrompt, createPromptFolder, promptFolders } = useAppStore();
  const { t } = useI18n();

  const handleImportAiStudioSystem = async () => {
    try {
      const res = await browser.runtime.sendMessage({
        type: 'GET_PAGE_LOCAL_STORAGE',
        payload: { key: AISTUDIO_SYSTEM_KEY },
      });
      if (!res?.success || res.data == null || res.data === '') {
        toast.info(t('toast.importAiStudioSystemNoData'));
        return;
      }
      let items: AiStudioSystemItem[];
      try {
        items = JSON.parse(res.data);
      } catch {
        toast.error(t('toast.importAiStudioSystemInvalid'));
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        toast.info(t('toast.importAiStudioSystemNoData'));
        return;
      }
      const folderName = t('prompts.aiStudioSystemFolderName');
      let folderId: string | null = promptFolders.find((f) => f.name === folderName)?.id ?? null;
      if (folderId == null) {
        folderId = await createPromptFolder(folderName, null);
      }
      if (folderId == null) {
        toast.error(t('toast.importAiStudioSystemFailed'));
        return;
      }
      let count = 0;
      for (const item of items) {
        const title = (item.title ?? item.text ?? '').trim() || t('prompts.untitledSystem');
        const content = (item.text ?? item.title ?? '').trim() || '';
        if (!content) continue;
        await createPrompt(title, content, 'system', 'Bot', folderId);
        count += 1;
      }
      toast.success(t('toast.importAiStudioSystemSuccess', { count }));
    } catch (err) {
      console.error('Import AI Studio system failed:', err);
      toast.error(t('toast.importAiStudioSystemFailed'));
    }
  };

  return {
    general: {
      menuActions: {
        onViewHistory: () => {
          navigate('https://aistudio.google.com/library');
        },
        onSwitchToOriginalUI: () => {
          setOverlayOpen(false);
        },
      },
    },
    explorer: {
      onNewChat: navigateToAiStudioNewChat,
      newChatButton: (
        <NewChatButton onTemporaryChat={startAiStudioTemporaryChat} />
      ),
      filterTypes: ['all', 'conversation', 'text-to-image'],
    },
    favorites: {},
    search: {
      extraHeaderButtons: [<ImportHistoryButton key="import" />],
      onNavigate: handleSearchNavigation,
    },
    prompts: {
      enabled: true,
      menuActions: {
        onImportAiStudioSystem: handleImportAiStudioSystem,
      },
    },
  };
};
