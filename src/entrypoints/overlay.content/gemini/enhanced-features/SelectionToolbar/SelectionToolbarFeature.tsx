/**
 * SelectionToolbarFeature — Shows a floating toolbar when text is selected
 * in the conversation area. Provides quick actions: Reference, Explain,
 * Save as Snippet, Summarize, Copy as Markdown.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { usePegasusStore, type SelectionToolbarConfig } from '@/shared/lib/pegasus-store';
import { SelectionToolbarPopup } from './SelectionToolbarPopup';
import mainStyles from '@/index.scss?inline';
import { applyShadowStyles } from '@/shared/lib/utils';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import {
  getEditor,
  insertTextAtEnd,
  replaceAllContent,
} from '@/entrypoints/overlay.content/shared/lib/quill-editor';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';

interface ToolbarPosition {
  top: number;
  left: number;
}

/**
 * The chat transcript, in priority order — the *only* region the toolbar reacts to.
 *
 * Deliberately not a comma-separated list: `querySelector('a, b')` returns the first
 * match in **document order**, not the first selector that matches. The previous
 * `'infinite-scroller.chat-history, .conversation-container, chat-window'` therefore
 * resolved to `<chat-window>`, which wraps the composer and the surrounding chrome as
 * well as the transcript — so selecting text in the input box, the model picker, or a
 * disclaimer popped the toolbar too. `chat-window` and `.conversation-container` are
 * both out for that reason (the latter is a single turn, nested inside the scroller).
 */
const CHAT_SCROLLER_SELECTORS = [
  'infinite-scroller.chat-history', // current Gemini markup
  'chat-window infinite-scroller', // same node, scoped — the sidebar history list is an
  // `infinite-scroller` too, so never query it bare
  'chat-window #chat-history', // fallback
] as const;

/** First selector that resolves, or null. */
function getChatScroller(): Element | null {
  for (const selector of CHAT_SCROLLER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export const SelectionToolbarFeature = () => {
  const config = usePegasusStore(
    (s) => s.enhancedFeatures.gemini.selectionToolbar,
  ) as SelectionToolbarConfig | undefined;

  const enabled = config?.enabled ?? true;

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<ToolbarPosition>({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState('');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ReactDOM.Root | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleReference = useCallback(() => {
    if (!selectedText) return;
    const editor = getEditor();
    if (!editor) return;

    editor.focus();
    const prefix = `[Reference]: "${selectedText}"\n\n`;
    insertTextAtEnd(editor, prefix);
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  const handleExplain = useCallback(() => {
    if (!selectedText) return;
    const editor = getEditor();
    if (!editor) return;

    editor.focus();
    const prompt = `Explain the following:\n\n"${selectedText}"`;
    replaceAllContent(editor, prompt);
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  const handleSummarize = useCallback(() => {
    if (!selectedText) return;
    const editor = getEditor();
    if (!editor) return;

    editor.focus();
    const prompt = `Summarize the following:\n\n"${selectedText}"`;
    replaceAllContent(editor, prompt);
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  const handleSaveAsSnippet = useCallback(async () => {
    if (!selectedText) return;
    try {
      const inboxRes = await browser.runtime.sendMessage({
        type: 'RESOLVE_SNIPPET_INBOX',
      });
      const folderId = inboxRes?.success ? inboxRes.data : null;

      const title =
        selectedText.substring(0, 50) +
        (selectedText.length > 50 ? '...' : '');

      await browser.runtime.sendMessage({
        type: 'CREATE_SNIPPET',
        payload: {
          id: crypto.randomUUID(),
          title,
          content: selectedText,
          sourceUrl: window.location.href,
          sourcePlatform: 'gemini',
          folderId,
        },
      });

      useAppStore.getState().fetchData(true);
      toast.success(i18n.t('snippets.savedToInbox'), 1500);
    } catch (err) {
      console.error('[SelectionToolbar] Failed to save snippet:', err);
    }
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  const handleCopy = useCallback(() => {
    if (!selectedText) return;
    navigator.clipboard.writeText(selectedText).then(() => {
      toast.success(i18n.t('common.copy'), 1500);
    });
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  const handleSaveAsPrompt = useCallback(async () => {
    if (!selectedText) return;
    try {
      const inboxRes = await browser.runtime.sendMessage({
        type: 'RESOLVE_PROMPT_INBOX',
      });
      const folderId = inboxRes?.success ? inboxRes.data : null;

      const title =
        selectedText.substring(0, 50) +
        (selectedText.length > 50 ? '...' : '');

      await browser.runtime.sendMessage({
        type: 'CREATE_PROMPT',
        payload: {
          id: crypto.randomUUID(),
          title,
          content: selectedText,
          type: 'normal',
          folderId,
        },
      });

      useAppStore.getState().fetchData(true);
      toast.success(i18n.t('prompts.savedToInbox'), 1500);
    } catch (err) {
      console.error('[SelectionToolbar] Failed to save prompt:', err);
    }
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [selectedText]);

  // ─── Selection Monitoring ────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    // Create shadow DOM host for the toolbar
    const host = document.createElement('div');
    host.id = 'bs-selection-toolbar-host';
    host.style.cssText = 'position:fixed;top:0;left:0;z-index:999999;pointer-events:none;';
    document.body.appendChild(host);
    hostRef.current = host;

    const shadow = host.attachShadow({ mode: 'open' });
    applyShadowStyles(shadow, mainStyles);

    const rootContainer = document.createElement('div');
    rootContainer.className = 'shadow-body';
    shadow.appendChild(rootContainer);
    containerRef.current = rootContainer;

    const reactRoot = ReactDOM.createRoot(rootContainer);
    rootRef.current = reactRoot;

    // Theme sync
    const syncTheme = () => {
      const themeValue = localStorage.getItem('Bard-Color-Theme');
      const isDark = themeValue
        ? themeValue === 'Bard-Dark-Theme'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) rootContainer.classList.add('dark');
      else rootContainer.classList.remove('dark');
    };
    syncTheme();
    const themeInterval = setInterval(syncTheme, 2000);

    return () => {
      clearInterval(themeInterval);
      reactRoot.unmount();
      host.remove();
      hostRef.current = null;
      rootRef.current = null;
      containerRef.current = null;
    };
  }, [enabled]);

  // Listen to mouseup for selection changes
  useEffect(() => {
    if (!enabled) return;

    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our own toolbar
      if (hostRef.current?.contains(e.target as Node)) return;

      // Debounce to let selection finalize
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        checkSelection();
      }, 10);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Only check on shift+arrow selection
      if (e.shiftKey) {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
          checkSelection();
        }, 10);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If clicking outside the toolbar, hide it.
      // composedPath() crosses the shadow boundary, so the host element is always
      // present in the path when the event originates inside our shadow tree —
      // no need to probe individual nodes (the path also contains `window`,
      // which is not a Node and would throw in contains()).
      if (!hostRef.current) return;
      if (!e.composedPath().includes(hostRef.current)) {
        setVisible(false);
      }
    };

    function checkSelection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setVisible(false);
        return;
      }

      const text = sel.toString().trim();
      if (text.length < 2) {
        setVisible(false);
        return;
      }

      // Only show the toolbar for selections that live entirely inside the transcript.
      // `commonAncestorContainer` is the whole test we need: a selection that starts in
      // a turn and runs out into the page has an ancestor above the scroller, so it
      // fails `contains()` and the toolbar stays down.
      const range = sel.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const chatScroller = getChatScroller();
      if (!chatScroller || !chatScroller.contains(ancestor)) {
        setVisible(false);
        return;
      }

      // Calculate position: above the selection
      const rect = range.getBoundingClientRect();
      const top = rect.top - 44; // toolbar height + gap
      const left = rect.left + rect.width / 2;

      setSelectedText(text);
      setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
      setVisible(true);
    }

    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [enabled]);

  // ─── Render toolbar into shadow DOM ──────────────────────────────────────

  useEffect(() => {
    if (!rootRef.current || !containerRef.current) return;

    rootRef.current.render(
      <ShadowRootProvider container={containerRef.current}>
        <SelectionToolbarPopup
          visible={visible}
          position={position}
          config={configRef.current}
          onReference={handleReference}
          onExplain={handleExplain}
          onSummarize={handleSummarize}
          onSaveAsSnippet={handleSaveAsSnippet}
          onCopy={handleCopy}
          onSaveAsPrompt={handleSaveAsPrompt}
        />
      </ShadowRootProvider>,
    );
  }, [
    visible,
    position,
    handleReference,
    handleExplain,
    handleSummarize,
    handleSaveAsSnippet,
    handleCopy,
    handleSaveAsPrompt,
  ]);

  return null;
};
