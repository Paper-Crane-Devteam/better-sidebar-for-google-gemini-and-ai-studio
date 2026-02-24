/**
 * Account detection for each platform.
 *
 * Returns the current user's username/email for the given platform.
 */

import { Platform } from '@/shared/types/platform';

/**
 * Wait for a DOM element with a timeout.
 * Polls via requestAnimationFrame, gives up after `timeoutMs`.
 */
function waitForSelector(
  selector: string,
  timeoutMs = 10000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() > deadline) return resolve(null);
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Detect current user on AI Studio.
 * Reads `.account-switcher-container .account-switcher-text` text content.
 */
export async function detectAiStudioAccount(): Promise<string | null> {
  try {
    const el = await waitForSelector(
      '.account-switcher-container .account-switcher-text',
    );
    const text = el?.textContent?.trim();
    if (text) {
      console.log('[DetectAccount] AI Studio account:', text);
      return text;
    }
  } catch (e) {
    console.warn('[DetectAccount] AI Studio detection failed:', e);
  }
  return null;
}

/**
 * Detect current user on Gemini.
 * Reads `<meta name="og-profile-acct" content="...">` from head.
 */
export async function detectGeminiAccount(): Promise<string | null> {
  try {
    // Meta tag may already be in the DOM or may appear shortly after load
    const el = await waitForSelector('meta[name="og-profile-acct"]');
    const content = el?.getAttribute('content')?.trim();
    if (content) {
      console.log('[DetectAccount] Gemini account:', content);
      return content;
    }
  } catch (e) {
    console.warn('[DetectAccount] Gemini detection failed:', e);
  }
  return null;
}

/**
 * Detect current user on ChatGPT.
 * Fetches `https://chatgpt.com/backend-api/me` and reads `response.name`.
 */
export async function detectChatGPTAccount(): Promise<string | null> {
  try {
    const resp = await fetch('https://chatgpt.com/backend-api/me', {
      method: 'GET',
      credentials: 'include',
    });
    if (!resp.ok) {
      console.warn('[DetectAccount] ChatGPT /me returned', resp.status);
      return null;
    }
    const data = await resp.json();
    const name = data?.name?.trim();
    if (name) {
      console.log('[DetectAccount] ChatGPT account:', name);
      return name;
    }
  } catch (e) {
    console.warn('[DetectAccount] ChatGPT detection failed:', e);
  }
  return null;
}

/**
 * Detect current user based on platform.
 */
export async function detectAccount(
  platform: Platform,
): Promise<string | null> {
  switch (platform) {
    case Platform.AI_STUDIO:
      return detectAiStudioAccount();
    case Platform.GEMINI:
      return detectGeminiAccount();
    case Platform.CHATGPT:
      return detectChatGPTAccount();
    default:
      return null;
  }
}
