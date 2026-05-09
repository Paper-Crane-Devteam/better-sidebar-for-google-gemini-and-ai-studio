import { navigate, navigateToGem } from '@/shared/lib/navigation';
import { handleSearchNavigation } from '../shared/utils';
import React, { useState, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { MessageSquareDashed, Gem as GemIcon } from 'lucide-react';
import { GemWithHistory } from '@/shared/components/icons/gem-composite-icons';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import { GemPickerContent } from '../shared/modules/gems/components/GemPickerContent';
import { SplitIconButton } from '@/shared/components/ui/split-icon-button';
import type { ModuleConfig } from '../shared/types/moduleConfig';

const useTemporaryChatToggle = () => {
  const [isTempChat, setIsTempChat] = useState(false);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let currentBtn: Element | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      currentBtn = null;
    };

    const updateState = (btn: Element) => {
      setIsTempChat(btn.classList.contains('temp-chat-on'));
    };

    const startObserving = (btn: Element) => {
      if (observer) observer.disconnect();

      observer = new MutationObserver(() => {
        updateState(btn);
        if (!document.body.contains(btn)) {
          cleanup();
          startPolling();
        }
      });

      observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
      if (btn.parentNode) {
        observer.observe(btn.parentNode, { childList: true });
      }
    };

    const checkAndObserve = () => {
      const btn = document.querySelector('button[aria-label="Temporary chat"]');
      if (btn) {
        if (btn !== currentBtn) {
          currentBtn = btn;
          updateState(btn);
          startObserving(btn);
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } else {
        if (!pollInterval) startPolling();
        currentBtn = null;
      }
    };

    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(checkAndObserve, 1000);
      }
    };

    checkAndObserve();
    if (!currentBtn) startPolling();

    return cleanup;
  }, []);

  const toggle = () => {
    const isOnNewChat = window.location.pathname === '/app';

    const clickTempChatBtn = () => {
      const btn = document.querySelector(
        'button[aria-label="Temporary chat"]',
      ) as HTMLButtonElement;
      if (btn) {
        btn.click();
      } else {
        console.warn('Temporary chat button not found');
      }
    };

    if (isOnNewChat) {
      clickTempChatBtn();
    } else {
      // Navigate to new chat first, then toggle after the page settles
      const newChatBtn = document.querySelector(
        'side-navigation-content mat-action-list side-nav-action-button a[aria-label="New chat"]',
      ) as HTMLElement;
      if (newChatBtn) {
        newChatBtn.click();
      } else {
        navigate('/app');
      }
      // Wait for the new chat page to render the temporary chat button
      const waitAndClick = (retries = 10) => {
        setTimeout(() => {
          const btn = document.querySelector(
            'button[aria-label="Temporary chat"]',
          ) as HTMLButtonElement;
          if (btn) {
            btn.click();
          } else if (retries > 0) {
            waitAndClick(retries - 1);
          } else {
            console.warn('Temporary chat button not found after navigation');
          }
        }, 300);
      };
      waitAndClick();
    }
  };

  return { isTempChat, toggle };
};

const GemSplitButton = () => {
  const { t } = useI18n();
  const lastSelectedGemId = useSettingsStore((s) => s.lastSelectedGemId);
  const { gems } = useAppStore();

  const lastSelectedGem = useMemo(
    () => (lastSelectedGemId ? gems.find((g) => g.id === lastSelectedGemId) : null),
    [gems, lastSelectedGemId],
  );

  const handleChatWithLastGem = () => {
    if (lastSelectedGem) {
      navigateToGem(lastSelectedGem.id);
    }
  };

  const handleNewGemChat = () => {
    useModalStore.getState().open({
      type: 'info',
      title: t('gems.selectGem'),
      content: <GemPickerContent lastSelectedGemId={lastSelectedGemId} />,
      confirmText: t('common.cancel'),
      modalClassName: 'max-w-sm',
    });
  };

  // No last gem — plain button that opens the picker
  if (!lastSelectedGem) {
    return (
      <SplitIconButton
        icon={<GemIcon className="h-4 w-4" />}
        tooltip={t('gems.selectGem')}
        onClick={handleNewGemChat}
      />
    );
  }

  // Has last gem — split button: main = chat with last gem (decorated), dropdown = open picker
  return (
    <SplitIconButton
      icon={<GemWithHistory />}
      tooltip={t('gems.chatWithLastGem', { name: lastSelectedGem.name })}
      onClick={handleChatWithLastGem}
      dropdownItems={[
        {
          label: t('gems.selectGem'),
          icon: GemIcon,
          onClick: handleNewGemChat,
          closeOnClick: true,
        },
      ]}
    />
  );
};

export const useModuleConfig = (): ModuleConfig => {
  const { t } = useI18n();
  const newChatBehavior = useSettingsStore((state) => state.newChatBehavior);
  const setOverlayOpen = useAppStore((state) => state.setOverlayOpen);
  const { toggle: toggleTempChat } = useTemporaryChatToggle();

  return {
    general: {
      menuActions: {
        onViewHistory: () => {
          navigate('/search');
        },
        onSwitchToOriginalUI: () => {
          setOverlayOpen(false);
        },
      },
    },
    explorer: {
      onNewChat: () => {
        const url = 'https://gemini.google.com/app';
        if (newChatBehavior === 'new-tab') {
          window.open(url, '_blank');
        } else {
          const newChatBtn = document.querySelector(
            'side-navigation-content mat-action-list side-nav-action-button a[aria-label="New chat"]',
          ) as HTMLElement;
          if (newChatBtn) {
            newChatBtn.click();
          } else {
            window.location.href = url;
          }
        }
      },
      newChatDropdownItems: [
        {
          label: t('tooltip.temporaryChat'),
          icon: MessageSquareDashed,
          onClick: toggleTempChat,
        },
      ],
      filterTypes: ['all', 'conversation', 'gem', 'notebook'] as const,
      visibleFilters: ['search', 'tags', 'type', 'favorites'],
      extraHeaderButtons: <GemSplitButton />,
    },
    favorites: {
      visibleFilters: ['search', 'tags'],
    },
    prompts: {
      enabled: true,
    },
    search: {
      onNavigate: handleSearchNavigation,
    },
  };
};
