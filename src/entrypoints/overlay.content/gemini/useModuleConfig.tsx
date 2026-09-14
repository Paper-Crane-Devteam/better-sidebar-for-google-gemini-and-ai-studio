import { navigate, navigateToNewChat } from '@/shared/lib/navigation';
import { handleSearchNavigation } from '../shared/utils';
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { NewChatButton } from './components/NewChatButton';
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
      const container = document.querySelector('div[data-test-id="temp-chat-button-container"]');
      const btn = container?.querySelector('button') || null;
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
    const clickTempChatBtn = (): boolean => {
      const container = document.querySelector(
        'div[data-test-id="temp-chat-button-container"]',
      );
      const btn = container?.querySelector('button') as HTMLButtonElement;
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    };

    // Try clicking directly first — works if already on /app
    if (clickTempChatBtn()) return;

    // Navigate to new chat first, then wait for the temp chat button to appear
    const newChatBtn = document.querySelector(
      'bard-sidenav .overflow-container gem-nav-list-item a',
    ) as HTMLElement;
    if (newChatBtn) {
      newChatBtn.click();
    } else {
      navigate('/app');
    }

    // Use MutationObserver to detect the temp chat button as soon as it renders
    const waitForTempChatBtn = () => {
      // Check immediately in case it's already there after navigation
      if (clickTempChatBtn()) return;

      const obs = new MutationObserver(() => {
        if (clickTempChatBtn()) {
          obs.disconnect();
          clearTimeout(timeout);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Fallback timeout to avoid observing forever
      const timeout = setTimeout(() => {
        obs.disconnect();
        if (!clickTempChatBtn()) {
          console.warn('Temporary chat button not found after navigation');
        }
      }, 5000);
    };

    waitForTempChatBtn();
  };

  return { isTempChat, toggle };
};

export const useModuleConfig = (): ModuleConfig => {
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
        navigateToNewChat();
      },
      newChatButton: <NewChatButton onTemporaryChat={toggleTempChat} />,
      filterTypes: ['all', 'conversation', 'gem', 'notebook'] as const,
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
