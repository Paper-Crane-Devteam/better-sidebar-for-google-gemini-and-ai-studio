import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import mainStyles from '@/index.scss?inline';
import { applyShadowStyles } from '@/shared/lib/utils';
import { extractSnippetData } from '@/shared/lib/utils/ai-studio';
import { SaveSnippetButton } from '@/entrypoints/overlay.content/gemini/enhanced-features/SaveSnippetButton';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { snippetDragBus } from '@/entrypoints/overlay.content/shared/modules/snippets/snippet-drag-bus';

const PROCESSED_ATTR = 'data-bs-snippet-processed';
const CHAT_CONTAINER_SELECTOR = 'ms-autoscroll-container';

/**
 * SaveSnippetFeature for AI Studio — injects a shadow-DOM "save snippet" button
 * next to each model response `ms-chat-turn` that contains both
 * `.model-prompt-container` and `ms-text-chunk`.
 *
 * Content extraction uses shared DOM-to-Markdown utilities from
 * `@/shared/lib/utils/ai-studio`, supporting code blocks, headings, lists, etc.
 *
 * The user question (title) is found by looking at the nearest preceding `ms-chat-turn`
 * that contains both `.user-prompt-container` and `ms-text-chunk`.
 */
export const SaveSnippetFeature = () => {
  const isDraggingRef = useRef(false);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const dragDataRef = useRef<{ title: string; content: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDragRef = useRef(false);
  const reactRootsRef = useRef<ReactDOM.Root[]>([]);

  useEffect(() => {
    const injectButtons = () => {
      // Target: ms-chat-turn that has BOTH .model-prompt-container AND ms-text-chunk
      const modelTurns = document.querySelectorAll(
        `ms-chat-turn:not([${PROCESSED_ATTR}])`,
      );

      modelTurns.forEach((turn) => {
        const hasModelContainer = turn.querySelector('.model-prompt-container');
        // Thinking models render the thoughts as a separate turn whose only
        // ms-text-chunk lives inside ms-thought-chunk. extractSnippetData skips
        // thoughts, so such a turn yields nothing — don't give it a button.
        // Not marked as processed, so it's re-checked if real content arrives.
        const hasTextChunk = Array.from(turn.querySelectorAll('ms-text-chunk')).some(
          (chunk) => !chunk.closest('ms-thought-chunk'),
        );
        if (!hasModelContainer || !hasTextChunk) return;

        turn.setAttribute(PROCESSED_ATTR, 'true');

        const turnEl = turn as HTMLElement;
        if (getComputedStyle(turnEl).position === 'static') {
          turnEl.style.position = 'relative';
        }

        // Create shadow DOM host for the button.
        // Placed inside the turn at the top-left (close to the sidebar, so the
        // hold-to-drag path stays short). Inside, not in the left gutter: the
        // gutter disappears when the chat column is narrow and the button got
        // clipped by the scroll container. Vertically centered on the turn's
        // top edge (straddling the border) so it doesn't cover the first line.
        const host = document.createElement('div');
        host.className = 'bs-snippet-btn-host';
        host.style.cssText =
          'position:absolute;top:0;left:12px;transform:translateY(-50%);z-index:10;opacity:0;transition:opacity 0.15s;';

        const shadow = host.attachShadow({ mode: 'open' });
        applyShadowStyles(shadow, mainStyles);

        const rootContainer = document.createElement('div');
        rootContainer.className = 'shadow-body';
        shadow.appendChild(rootContainer);

        // Sync dark mode
        const syncTheme = () => {
          const isDark = document.body.classList.contains('dark-theme');
          if (isDark) rootContainer.classList.add('dark');
          else rootContainer.classList.remove('dark');
        };
        syncTheme();

        // Render React component inside shadow
        const reactRoot = ReactDOM.createRoot(rootContainer);
        reactRootsRef.current.push(reactRoot);

        reactRoot.render(
          <ShadowRootProvider container={rootContainer}>
            <SaveSnippetButton
              onSave={() => {
                const data = extractSnippetData(turnEl);
                if (data) saveToInbox(data.title, data.content);
              }}
              onDragStart={(e) => {
                const data = extractSnippetData(turnEl);
                if (data) {
                  didDragRef.current = true;
                  dragDataRef.current = data;
                  startDragMode(e, data);
                }
              }}
              onMouseDown={() => {
                didDragRef.current = false;
                longPressTimerRef.current = setTimeout(() => {
                  // Will be handled by onDragStart
                }, 300);
              }}
              getLongPressActive={() => !didDragRef.current}
            />
          </ShadowRootProvider>,
        );

        // Show/hide on turn hover
        turnEl.addEventListener('mouseenter', () => {
          host.style.opacity = '1';
        });
        turnEl.addEventListener('mouseleave', () => {
          if (!isDraggingRef.current) {
            host.style.opacity = '0';
          }
        });

        turnEl.appendChild(host);
      });
    };

    // ─── Save logic ───────────────────────────────────────────────────────

    async function saveToInbox(title: string, content: string) {
      try {
        const inboxRes = await browser.runtime.sendMessage({
          type: 'RESOLVE_SNIPPET_INBOX',
        });
        const folderId = inboxRes?.success ? inboxRes.data : null;

        await browser.runtime.sendMessage({
          type: 'CREATE_SNIPPET',
          payload: {
            id: crypto.randomUUID(),
            title,
            content,
            sourceUrl: window.location.href,
            sourcePlatform: 'aistudio',
            folderId,
          },
        });

        useAppStore.getState().fetchData(true);
        toast.success(i18n.t('snippets.savedToInbox'), 1500);
      } catch (err) {
        console.error('[SaveSnippet] AI Studio: Failed to save:', err);
      }
    }

    async function saveToFolder(
      title: string,
      content: string,
      folderId: string | null,
      folderName?: string,
    ) {
      try {
        let targetFolderId = folderId;
        if (!targetFolderId) {
          const inboxRes = await browser.runtime.sendMessage({
            type: 'RESOLVE_SNIPPET_INBOX',
          });
          targetFolderId = inboxRes?.success ? inboxRes.data : null;
        }

        await browser.runtime.sendMessage({
          type: 'CREATE_SNIPPET',
          payload: {
            id: crypto.randomUUID(),
            title,
            content,
            sourceUrl: window.location.href,
            sourcePlatform: 'aistudio',
            folderId: targetFolderId,
          },
        });

        useAppStore.getState().fetchData(true);

        if (folderName) {
          toast.success(i18n.t('snippets.savedToFolder', { folderName }), 1500);
        } else {
          toast.success(i18n.t('snippets.savedToInbox'), 1500);
        }
      } catch (err) {
        console.error('[SaveSnippet] AI Studio: Failed to save:', err);
      }
    }

    // ─── Drag logic ───────────────────────────────────────────────────────

    function startDragMode(
      e: MouseEvent | React.MouseEvent,
      data: { title: string; content: string },
    ) {
      isDraggingRef.current = true;
      snippetDragBus.emit('drag:start', undefined);

      const ghost = document.createElement('div');
      ghost.style.cssText =
        'position:fixed;pointer-events:none;z-index:99999;padding:5px 10px;background:var(--mat-sys-surface, #fff);border:1px solid var(--mat-sys-outline-variant, #dadce0);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.9;';
      ghost.textContent = data.title.substring(0, 30);
      ghost.style.left = `${e.clientX + 10}px`;
      ghost.style.top = `${e.clientY + 10}px`;
      document.body.appendChild(ghost);
      dragGhostRef.current = ghost;

      document.addEventListener('mousemove', handleDragMove, true);
      document.addEventListener('mouseup', handleDragEnd, true);
    }

    function handleDragMove(e: MouseEvent) {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.left = `${e.clientX + 10}px`;
        dragGhostRef.current.style.top = `${e.clientY + 10}px`;
      }
    }

    function handleDragEnd(_e: MouseEvent) {
      document.removeEventListener('mousemove', handleDragMove, true);
      document.removeEventListener('mouseup', handleDragEnd, true);

      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }

      isDraggingRef.current = false;

      const dropTarget = snippetDragBus.currentDropTarget;
      snippetDragBus.clearDropTarget();
      snippetDragBus.emit('drag:end', undefined);

      if (dragDataRef.current && dropTarget !== undefined) {
        const folderName = dropTarget
          ? useAppStore
              .getState()
              .snippetFolders.find((f) => f.id === dropTarget)?.name
          : undefined;
        saveToFolder(
          dragDataRef.current.title,
          dragDataRef.current.content,
          dropTarget,
          folderName,
        );
        dragDataRef.current = null;
      } else {
        dragDataRef.current = null;
      }
    }

    // ─── Observers ────────────────────────────────────────────────────────

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) injectButtons();
    });

    // Observe the chat container (ms-autoscroll-container or body)
    let currentContainer: Element | null = null;

    const startObserving = () => {
      const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
      if (container && container !== currentContainer) {
        observer.disconnect();
        currentContainer = container;
        observer.observe(container, {
          childList: true,
          subtree: true,
        });
        injectButtons();
        return true;
      }
      if (container && container === currentContainer) {
        injectButtons();
        return true;
      }
      return false;
    };

    if (!startObserving()) {
      const pollInterval = setInterval(() => {
        if (startObserving()) clearInterval(pollInterval);
      }, 1000);
      setTimeout(() => clearInterval(pollInterval), 60000);
    }

    // Body observer for SPA navigation (AI Studio may recreate the chat container)
    const bodyObserver = new MutationObserver(() => {
      const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
      if (container && container !== currentContainer) {
        startObserving();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      bodyObserver.disconnect();
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      document.removeEventListener('mousemove', handleDragMove, true);
      document.removeEventListener('mouseup', handleDragEnd, true);
      reactRootsRef.current.forEach((root) => root.unmount());
      reactRootsRef.current = [];
    };
  }, []);

  return null;
};
