// AI Studio main-world script: intercepts XHR/fetch and dispatches events

import { proxy } from 'ajax-hook';
import throttle from 'lodash/throttle';
import { handleChatResponse } from './interceptors/chat';
import { handleLibraryResponse } from './interceptors/library';
import { handleUpdatePromptResponse } from './interceptors/update';
import { handleCreatePromptResponse } from './interceptors/create';
import { handleDeletePromptResponse } from './interceptors/delete';
import { observeGenerateContentStream } from './interceptors/generate-content';
import { aiStudioRequestBuilder } from './lib/request-builder';
import { initAiStudioBackfillFetcher } from './lib/backfill-fetcher';
import i18n from '@/locale/i18n-bundled';

/**
 * Patch Element.prototype.animate to skip Angular slideInOut animations
 * inside ms-right-side-panel when auto-hide run settings is active.
 */
let killRunSettingsAnimation = false;

function patchElementAnimate() {
  const originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    if (killRunSettingsAnimation && this.closest('ms-right-side-panel')) {
      // Force duration to 0 to skip the animation
      if (typeof options === 'number') {
        options = 0;
      } else if (options && typeof options === 'object') {
        options = { ...options, duration: 0 };
      }
    }
    return originalAnimate.call(this, keyframes, options);
  };
}

patchElementAnimate();

// Listen for toggle from content script
globalThis.addEventListener('BETTER_SIDEBAR_KILL_RUN_SETTINGS_ANIM', (e: Event) => {
  killRunSettingsAnimation = !!(e as CustomEvent).detail?.enabled;
});

const showUpdateToast = throttle(
  () => {
    const message = i18n.t('toast.interfaceUpdated');
    console.warn('Better Sidebar:', message);

    const toast = document.createElement('div');
    toast.innerText = message;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#d93025',
      color: '#ffffff',
      padding: '12px 24px',
      borderRadius: '4px',
      zIndex: '10000',
      fontFamily: 'Google Sans, Roboto, sans-serif',
      fontSize: '14px',
      boxShadow:
        '0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)',
      transition: 'opacity 0.3s',
      opacity: '0',
      pointerEvents: 'none',
    });

    document.body.appendChild(toast);

    void toast.offsetWidth;
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  },
  10000,
  { trailing: false },
);

export function initAiStudioInterceptors() {
  console.log('Better Sidebar: Main World Script (AI Studio) Initialized');

  // Serves the content script's silent-backfill requests. Registered here, but
  // it only ever answers; nothing happens unless the scheduler asks.
  initAiStudioBackfillFetcher();

  // Cache pending create title from overlay content script (different JS context).
  // The overlay dispatches BETTER_SIDEBAR_SET_PENDING_TITLE via DOM CustomEvent.
  let pendingCreateTitle = '';
  globalThis.addEventListener('BETTER_SIDEBAR_SET_PENDING_TITLE', (e: Event) => {
    pendingCreateTitle = (e as CustomEvent).detail?.title || '';
  });

  // AI Studio has no native temporary chat, so the intent has to come from our
  // sidebar. Same channel as the pending title above: the overlay dispatches
  // BETTER_SIDEBAR_SET_TEMP_CHAT when the user asks for a temporary chat, and it
  // is consumed by the next CreatePrompt.
  //
  // One-shot rather than a sticky mode: it is cleared the moment a prompt is
  // created, so a stale intent cannot silently hide a later, unrelated chat.
  let pendingTemporaryChat = false;
  globalThis.addEventListener('BETTER_SIDEBAR_SET_TEMP_CHAT', (e: Event) => {
    pendingTemporaryChat = !!(e as CustomEvent).detail?.temporary;
  });
  const consumePendingTemporaryChat = (): boolean => {
    const value = pendingTemporaryChat;
    pendingTemporaryChat = false;
    return value;
  };

  // Expose request builder for content script via custom events
  globalThis.addEventListener('AISTUDIO_API_EXECUTE', async (e: Event) => {
    const { method, body, callbackEvent } = (e as CustomEvent).detail || {};
    if (!method || !callbackEvent) return;

    try {
      const res = await aiStudioRequestBuilder.execute({ method, body });
      const text = await res.text();
      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: res.ok, status: res.status, body: text },
        }),
      );
    } catch (err: any) {
      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: false, status: 0, error: err.message },
        }),
      );
    }
  });

  // Our rename goes straight to the API, but AI Studio's in-memory prompt still
  // holds the old title, and every UpdatePrompt it sends (e.g. after a reply
  // lands) carries the whole prompt, title included. Without a correction the
  // first post-reply save reverts the rename until the page is reloaded.
  //
  // So remember what we renamed and from what, and rewrite only requests that
  // still carry that exact stale title. A different title means the user
  // renamed it natively, which wins. A page-issued ResolveDriveResource for the
  // prompt means the page has reloaded fresh state, so the override is done.
  const titleOverrides = new Map<string, { title: string; staleTitle: string }>();

  const applyTitleOverride = (config: { body?: any }) => {
    if (titleOverrides.size === 0) return;
    try {
      const body = typeof config.body === 'string' ? JSON.parse(config.body) : config.body;
      const item = Array.isArray(body) ? body[0] : null;
      if (!Array.isArray(item) || typeof item[0] !== 'string' || !Array.isArray(item[4])) return;

      const id = item[0].split('/').pop() || '';
      const override = titleOverrides.get(id);
      if (!override) return;

      const current = item[4][0] ?? '';
      if (current === override.title) return;
      if (current !== override.staleTitle) {
        titleOverrides.delete(id);
        return;
      }

      item[4][0] = override.title;
      config.body = JSON.stringify(body);
      console.log('Better Sidebar (AI Studio): Restored renamed title in UpdatePrompt:', override.title);
    } catch (e) {
      console.warn('Better Sidebar (AI Studio): Failed to apply title override', e);
    }
  };

  // AI Studio rename: fetch full prompt data, replace title, then update
  globalThis.addEventListener('AISTUDIO_RENAME', async (e: Event) => {
    const { promptId, newName, callbackEvent } = (e as CustomEvent).detail || {};
    if (!promptId || !callbackEvent) return;

    try {
      // Step 1: Fetch full prompt data via ResolveDriveResource
      const resolveRes = await aiStudioRequestBuilder.execute({
        method: 'ResolveDriveResource',
        body: [promptId],
      });
      if (!resolveRes.ok) {
        globalThis.dispatchEvent(
          new CustomEvent(callbackEvent, {
            detail: { ok: false, status: resolveRes.status, error: 'Failed to fetch prompt data' },
          }),
        );
        return;
      }

      const rawText = await resolveRes.text();
      const cleanText = rawText.replace(/^\)\]\}'/, '').trim();
      const promptData = JSON.parse(cleanText);

      // promptData is the full prompt array, e.g. [["prompts/xxx", ...]]
      // Get the inner array (could be nested)
      let root = promptData;
      if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
        root = root[0];
      }

      const staleTitle: string =
        (Array.isArray(root) && Array.isArray(root[4]) ? root[4][0] : '') ?? '';

      // Step 2: Replace title at index [4][0]
      if (Array.isArray(root) && root.length > 4 && Array.isArray(root[4])) {
        root[4][0] = newName;
      } else if (Array.isArray(root) && root.length > 4) {
        root[4] = [newName];
      } else {
        // Extend array if needed
        while (root.length <= 4) root.push(null);
        root[4] = [newName];
      }

      // Step 3: UpdatePrompt with modified data
      const updateRes = await aiStudioRequestBuilder.execute({
        method: 'UpdatePrompt',
        body: [root],
      });
      const updateText = await updateRes.text();

      if (updateRes.ok && staleTitle !== newName) {
        titleOverrides.set(promptId, { title: newName, staleTitle });
      }

      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: updateRes.ok, status: updateRes.status, body: updateText },
        }),
      );
    } catch (err: any) {
      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: false, status: 0, error: err.message },
        }),
      );
    }
  });

  proxy({
    onRequest: (config, handler) => {
      // Learn params from AI Studio API requests
      if (config.url?.includes('alkalimakersuite-pa.clients6.google.com')) {
        try {
          aiStudioRequestBuilder.learn(
            config.url,
            (config.headers as Record<string, string>) || {},
          );
        } catch {
          // non-critical
        }

        // The one streaming endpoint. Attached here rather than in `onResponse`
        // because by then the whole generation has already arrived — see
        // `interceptors/generate-content.ts`.
        if (config.url.includes('GenerateContent') && config.xhr) {
          try {
            observeGenerateContentStream(config.xhr, config.body);
          } catch (e) {
            // The live view is an improvement on the response path, not a
            // replacement for it. If this fails the transcript still lands via
            // UpdatePrompt, so never let it break the request itself.
            console.warn('Better Sidebar: failed to observe GenerateContent stream', e);
          }
        }

        if (config.url.includes('UpdatePrompt')) {
          applyTitleOverride(config);
        }

        // Notify overlay that a new chat generation has started
        if (config.url?.includes('CreatePrompt')) {
          // If a custom title is pending, inject it into the CreatePrompt request body
          if (pendingCreateTitle) {
            try {
              let body = config.body;
              if (typeof body === 'string') {
                body = JSON.parse(body);
              }
              if (Array.isArray(body) && Array.isArray(body[0]) && Array.isArray(body[0][4])) {
                body[0][4][0] = pendingCreateTitle;
                config.body = JSON.stringify(body);
                console.log('Better Sidebar (AI Studio): Injected custom title into CreatePrompt:', pendingCreateTitle);
              }
            } catch (e) {
              console.warn('Better Sidebar (AI Studio): Failed to inject title into CreatePrompt', e);
            }
            pendingCreateTitle = '';
          }

          globalThis.dispatchEvent(
            new CustomEvent('BETTER_SIDEBAR_GENERATE_START'),
          );
        }
      }
      handler.next(config);
    },
    onError: (err, handler) => {
      console.error('Better Sidebar: Request Error', err);
      handler.next(err);
    },
    onResponse: (response, handler) => {
      const url = response.config.url;
      try {
        if (url.includes('ResolveDriveResource')) {
          // The page now holds fresh server state for this prompt
          if (titleOverrides.size > 0) {
            try {
              const reqBody = response.config.body;
              const parsed = typeof reqBody === 'string' ? JSON.parse(reqBody) : reqBody;
              const id = Array.isArray(parsed) ? parsed[0] : null;
              if (typeof id === 'string') titleOverrides.delete(id.split('/').pop() || id);
            } catch {
              // non-critical
            }
          }
          // Opening a prompt, not activity on it
          handleChatResponse(response, url, false);
        } else if (url.endsWith('ListPrompts')) {
          handleLibraryResponse(response);
        } else if (url.includes('UpdatePrompt')) {
          handleUpdatePromptResponse(response, url);
        } else if (url.includes('CreatePrompt')) {
          handleCreatePromptResponse(response, url, consumePendingTemporaryChat());
        } else if (url.includes('DeletePrompt')) {
          handleDeletePromptResponse(response, url);
        }
      } catch (e) {
        console.error('Better Sidebar: Error in interception handler', e);
        if (response?.status === 200) {
          showUpdateToast();
        }
      }

      handler.next(response);
    },
  });
}
