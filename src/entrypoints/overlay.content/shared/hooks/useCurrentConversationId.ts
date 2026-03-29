import { useUrl } from '@/shared/hooks/useUrl';
import { detectPlatform, PLATFORM_CONFIG, Platform } from '@/shared/types/platform';

/** Matches /gem/{gemId}/{convoId} — captures the convoId */
const GEMINI_GEM_CONVO_RE = /\/gem\/[^/]+\/([a-zA-Z0-9_-]+)/;

export const useCurrentConversationId = () => {
  const { url } = useUrl();
  
  const platform = detectPlatform();

  // For Gemini, also check the /gem/:gemId/:convoId pattern
  if (platform === Platform.GEMINI) {
    const gemMatch = GEMINI_GEM_CONVO_RE.exec(url);
    if (gemMatch) return gemMatch[1];
  }

  const chatUrlTemplate = PLATFORM_CONFIG[platform].promptUrlTemplate();
  const regex = new RegExp(`${chatUrlTemplate}([a-zA-Z0-9_-]+)`);
  const match = regex.exec(url);
  return match?.[1] || null;
};
