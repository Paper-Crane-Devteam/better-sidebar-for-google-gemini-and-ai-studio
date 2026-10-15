import { PLATFORM_CONFIG, detectPlatform, Platform } from '@/shared/types/platform';
import { navigate, navigateToConversation } from '@/shared/lib/navigation';
import { browser } from 'wxt/browser';
import { jumpToGeminiMessage } from './gemini-jump-to-message';

interface SearchMatch {
  id: string;
  conversation_id: string;
  external_url?: string;
  platform?: string;
  scroll_index?: number;
}

export function getExternalUrl(id: string) {
  const platform = detectPlatform();
  return PLATFORM_CONFIG[platform].promptUrlTemplate(id);
}

export async function handleSearchNavigation(match: SearchMatch) {
  const currentPlatform = detectPlatform();
  const targetPlatform = (match.platform as Platform) || currentPlatform;

  // 1. Handle cross-platform navigation (open in new tab)
  if (currentPlatform !== targetPlatform && match.platform) {
    let url = match.external_url;
    if (!url && PLATFORM_CONFIG[targetPlatform]) {
      url = PLATFORM_CONFIG[targetPlatform].promptUrlTemplate(match.conversation_id);
    }
    
    if (url) {
      window.open(url, '_blank');
      return;
    }
    
    console.warn(`Could not determine URL for platform: ${targetPlatform}`);
    // Fallback to same-platform logic if URL determination fails, though unlikely
  }

  // 2. Handle same-platform navigation
  if (currentPlatform === Platform.GEMINI) {
    // `id` is the chat id itself for conversation-level hits; only scroll for messages
    if (match.id && match.id !== match.conversation_id) {
      await jumpToGeminiMessage(match);
    } else {
      navigateToConversation(match.conversation_id);
    }
    return;
  }

  if (currentPlatform !== Platform.AI_STUDIO) {
    navigateToConversation(match.conversation_id);
    return;
  }

  // 3. AI Studio specific logic (with scrolling)
  // Default fallback for AI Studio or others
  const url = match.external_url || `https://aistudio.google.com/prompts/${match.conversation_id}`;
  navigate(url);

  let scrollIndex = match.scroll_index;

  // Fetch scroll index if missing (lazy load)
  if (scrollIndex === undefined) {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_MESSAGE_SCROLL_INDEX',
        payload: {
          messageId: match.id,
          conversationId: match.conversation_id,
        },
      });
      if (response && response.success) {
        scrollIndex = response.data;
      }
    } catch (error) {
      console.error('Failed to fetch scroll index', match.id, error);
    }
  }

  // Wait for editor to load and then scroll
  if (typeof scrollIndex === 'number') {
    const targetScrollIndex = scrollIndex;
    const startTime = Date.now();
    const timeout = 10000;

    const checkAndClick = () => {
      if (Date.now() - startTime > timeout) return;

      const mainEditor = document.querySelector('.chunk-editor-main');
      if (mainEditor) {
        setTimeout(() => {
          const scrollbar = document.querySelector('ms-prompt-scrollbar');
          if (scrollbar) {
            const items = scrollbar.querySelectorAll('.prompt-scrollbar-item');
            if (items && items[targetScrollIndex]) {
              const item = items[targetScrollIndex] as HTMLElement;
              const button = item.querySelector('button');
              button?.click();
            }
          }
        }, 500);
      } else {
        setTimeout(checkAndClick, 100);
      }
    };
    setTimeout(() => {
      checkAndClick();
    }, 500);
  }
}
