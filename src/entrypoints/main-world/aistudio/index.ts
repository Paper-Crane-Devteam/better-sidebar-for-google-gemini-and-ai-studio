// AI Studio main-world script: intercepts XHR/fetch and dispatches events

import { proxy } from 'ajax-hook';
import throttle from 'lodash/throttle';
import { handleChatResponse } from './interceptors/chat';
import { handleLibraryResponse } from './interceptors/library';
import { handleUpdatePromptResponse } from './interceptors/update';
import { handleCreatePromptResponse } from './interceptors/create';
import { handleDeletePromptResponse } from './interceptors/delete';
import { aiStudioRequestBuilder } from './lib/request-builder';
import i18n from '@/locale/i18n';

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
          handleChatResponse(response, url);
        } else if (url.endsWith('ListPrompts')) {
          handleLibraryResponse(response);
        } else if (url.includes('UpdatePrompt')) {
          handleUpdatePromptResponse(response, url);
        } else if (url.includes('CreatePrompt')) {
          handleCreatePromptResponse(response, url);
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
