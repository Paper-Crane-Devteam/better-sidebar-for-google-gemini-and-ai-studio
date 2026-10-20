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
import { importNativeInstructions } from './lib/system-instructions';

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

export const useModuleConfig = (): ModuleConfig => {
  const setOverlayOpen = useAppStore((s) => s.setOverlayOpen);
  const { t } = useI18n();

  const handleImportAiStudioSystem = async () => {
    const result = await importNativeInstructions();
    if (result.status === 'ok') toast.success(t('toast.importAiStudioSystemSuccess', { count: result.count }));
    else if (result.status === 'nodata') toast.info(t('toast.importAiStudioSystemNoData'));
    else if (result.status === 'invalid') toast.error(t('toast.importAiStudioSystemInvalid'));
    else toast.error(t('toast.importAiStudioSystemFailed'));
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
