import { detectPlatform, Platform } from '@/shared/types/platform';

/**
 * Trigger Gemini's native "New chat" button click.
 * Returns true if the button was found and clicked.
 */
const clickGeminiNewChat = (): boolean => {
  const newChatBtn = document.querySelector(
    'side-navigation-content mat-action-list side-nav-action-button a[aria-label="New chat"]',
  ) as HTMLElement;
  if (newChatBtn) {
    newChatBtn.click();
    return true;
  }
  return false;
};

/**
 * Navigate to a Gem chat. Creates a new chat first to work around
 * a bug where navigating directly to a gem URL can fail.
 * Accepts either a gem ID or a full gem URL.
 */
export const navigateToGem = (gemIdOrUrl: string) => {
  const gemUrl = gemIdOrUrl.startsWith('http')
    ? gemIdOrUrl
    : `https://gemini.google.com/gem/${gemIdOrUrl}`;
  // Trigger new chat first, then navigate to the gem
  clickGeminiNewChat();
  navigate(gemUrl);
};

export const navigate = (url: string) => {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const navigateToNewChat = () => {
  const platform = detectPlatform();
  if (platform === Platform.GEMINI) {
    if (!clickGeminiNewChat()) {
      navigate('/app');
    }
  } else if (platform === Platform.AI_STUDIO) {
    navigate('/prompts/new_chat');
  }
};

export const navigateToConversation = (targetId: string) => {
  const platform = detectPlatform();
  if (platform === Platform.GEMINI) {
    const links = document.querySelectorAll('a[data-test-id="conversation"]');
    const targetHref = `/app/${targetId}`;
    
    for (const link of Array.from(links)) {
      if (link.classList.contains('conversation')) {
        const href = link.getAttribute('href');
        if (href && href.includes(targetHref)) {
          (link as HTMLElement).click();
          return;
        }
      }
    }
    
    // Fallback: same approach as navigateToGem — click "New chat" first, then pushState
    console.warn(`Conversation link not found for id: ${targetId}, falling back to new chat + pushState`);
    clickGeminiNewChat();
    navigate(`/app/${targetId}`);
  }
  if(platform === Platform.AI_STUDIO) {
    navigate(`/prompts/${targetId}`);
  }
  if(platform === Platform.CHATGPT) {
    navigate(`/c/${targetId}`);
  }
  if(platform === Platform.CLAUDE) {
    navigate(`/chat/${targetId}`);
  }
};
