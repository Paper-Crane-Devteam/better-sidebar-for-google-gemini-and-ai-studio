import { navigate } from '@/shared/lib/navigation';
import type { ExplorerTypeFilter } from '../shared/types/filter';
import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import type { ModuleConfig } from '../shared/types/moduleConfig';
import { handleSearchNavigation } from '../shared/utils';

export const useModuleConfig = (): ModuleConfig => {
  const { setOverlayOpen } = useAppStore();
  const { t } = useI18n();

  return {
    general: {
      menuActions: {
        onViewHistory: () => {
          // TODO: Navigate to ChatGPT history page
        },
        onSwitchToOriginalUI: () => {
          setOverlayOpen(false);
        },
      },
    },
    explorer: {
      onNewChat: () => {
        // TODO: Implement new chat for ChatGPT
        navigate('/');
      },
      filterTypes: ['all', 'conversation'],
    },
    favorites: {},
    search: {
      onNavigate: handleSearchNavigation,
    },
    prompts: {
      enabled: true,
    },
  };
};
