/**
 * AgentLoopFeature — Gemini entry point for Agent Loop.
 *
 * Flow:
 * 1. User types `>` (or clicks a card in the Agent tab launcher)
 * 2. An entry is staged in the editor as a capsule
 * 3. User optionally types additional context after the capsule
 * 4. On send → composeAndSend() builds the full prompt and starts the engine
 * 5. Engine watches the AI response, parses tool calls, loops
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { browserRequest, initializeBrowserAgent, useBrowserAgent } from '@/entrypoints/overlay.content/shared/modules/browser-agent/client';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { showCapsuleDetailModal } from '@/entrypoints/overlay.content/shared/lib/capsule-modal';
import {
  AgentCommandPopup,
  AgentLoopEngine,
  useAgentTrigger,
  useAgentLoopStore,
  ConversationOverlay,
  ConversationViewSwitcher,
  injectRendererStyles,
  buildPromptMarker,
  setActiveEngine,
  clearActiveEngine,
  getActiveEngine,
  agentEventBus,
  isSyncRunActive,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop';
import { AgentDock } from '@/entrypoints/overlay.content/shared/modules/agent-dock';
import { canUndo, runUndoFlow } from '@/entrypoints/overlay.content/shared/modules/agent-loop/undo';
import { toast } from '@/shared/lib/toast';
import { retireOnboardingHint } from '@/shared/lib/onboarding-store';
import i18n from '@/locale/i18n';
import {
  readConversationIdFromPath,
  useCurrentConversationId,
} from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { useConversationMessages } from '@/entrypoints/overlay.content/shared/modules/agent-loop/renderer/useConversationMessages';
import { endsSession } from '@/entrypoints/overlay.content/shared/modules/agent-loop/renderer/helpers/session-end';
import {
  createAdapterForCurrentPlatform,
  getCurrentPlatformId,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop/adapters/adapter-factory';
import { assembleFinalPrompt } from '@/entrypoints/overlay.content/shared/modules/agent-loop/prompts/prompt-assembler';
import { getEnabledSkills } from '@/entrypoints/overlay.content/shared/modules/agent-loop/skills/skill-registry';
import { initMCPRegistry } from '@/entrypoints/overlay.content/shared/modules/agent-loop/mcp/setup';
import { getAgentEntryById, browserEntryNeedsPermission } from '@/entrypoints/overlay.content/shared/modules/agent-loop/agent-entry';
import {
  buildToolCallFingerprint,
  buildToolCallKey,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop/execution-policy';
import { useAgentRecordStore } from '@/entrypoints/overlay.content/shared/modules/agent-loop/agent-record-store';
import { buildOwedPayload } from '@/entrypoints/overlay.content/shared/modules/agent-loop/recovery';
import type { AgentPlatformAdapter } from '@/entrypoints/overlay.content/shared/modules/agent-loop';
import {
  useEditorIntegration,
  insertCapsule,
  expandAllCapsules,
  CAPSULE_CLASS,
} from '@/entrypoints/overlay.content/shared/features/trigger-popup';
import type { TriggerPopupItem, CapsuleClickInfo } from '@/entrypoints/overlay.content/shared/features/trigger-popup';
import {
  installSendButtonInterceptor,
  appendCapsule,
  insertTextAtEnd,
  triggerSend,
  CAPSULE_ATTR_ID,
  CAPSULE_ATTR_CONTENT,
} from '@/entrypoints/overlay.content/shared/lib/quill-editor';

const MAX_MESSAGE_LENGTH = 30000;

/**
 * Whether the engine currently owns the chat input.
 *
 * True exactly while stage ④ has a payload staged there: `sending` (about to click
 * send itself) and `awaiting_send` (waiting for the user to press Enter). Both are
 * states where anything the user adds gets sent as part of the tool results.
 *
 * Other running states — `waiting_ai`, `executing`, `awaiting_approval` — leave the
 * composer empty and free to use.
 */
function isComposerHeldByEngine(): boolean {
  const status = useAgentLoopStore.getState().status;
  return status === 'sending' || status === 'awaiting_send';
}

export const AgentLoopFeature: React.FC = () => {
  useEffect(initializeBrowserAgent, []);
  const { t } = useI18n();
  const slashCommandEnabled = usePegasusStore(
    (s) => s.enhancedFeatures.gemini.slashCommand,
  );

  const adapterRef = useRef<AgentPlatformAdapter | null>(null);
  const getAdapter = useCallback((): AgentPlatformAdapter | null => {
    if (!adapterRef.current) {
      adapterRef.current = createAdapterForCurrentPlatform();
    }
    return adapterRef.current;
  }, []);

  const engineRef = useRef<AgentLoopEngine | null>(null);
  const [isSlashCommandActive, setIsSlashCommandActive] = useState(false);

  // Conversation the session will be attached to (kept in a ref for callbacks)
  const conversationId = useCurrentConversationId();
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const {
    state: triggerState,
    handleInput,
    selectPrevious,
    selectNext,
    setHighlight,
    close,
    getSelectedEntry,
  } = useAgentTrigger(isSlashCommandActive);

  /**
   * Load the tool call ledger for whichever conversation is open.
   *
   * Done here, at the page level, rather than in the conversation overlay: the cards
   * need it, but so does the dock's recovery prompt, and the dock has to work with the
   * sidebar closed and in Gemini's native rendering.
   */
  const loadRecords = useAgentRecordStore((s) => s.load);
  useEffect(() => {
    void loadRecords(conversationId);
  }, [conversationId, loadRecords]);

  /**
   * Whether the ledger for *this* conversation has arrived.
   *
   * Auto-pickup must not run before it does. Reading the database is a round trip
   * through the worker, and the pickup effect is driven by the DOM — which is ready
   * first. Without this gate the guard below reads an empty ledger on the very render
   * where it matters most, and re-executes the calls it was added to protect.
   *
   * The comparison is against the store's own `conversationId`, so a navigation that
   * outpaces the query also reads as "not ready" rather than as "nothing recorded".
   */
  const recordsReady = useAgentRecordStore(
    (s) => !s.loading && s.conversationId === conversationId,
  );

  const handleCapsuleClick = useCallback((info: CapsuleClickInfo) => {
    showCapsuleDetailModal(t('agent.tool.promptTitle', { defaultValue: 'Prompt content' }), info.content);
  }, [t]);

  const triggerStateRef = useRef(triggerState);
  triggerStateRef.current = triggerState;
  const getSelectedEntryRef = useRef(getSelectedEntry);
  getSelectedEntryRef.current = getSelectedEntry;

  // ─── Initialize renderer styles & editor interceptors ──────────────

  useEffect(() => {
    initMCPRegistry();
    injectRendererStyles();
    installSendButtonInterceptor();
  }, []);

  // ─── Undo prompt when a session ends having changed data ────────────

  /**
   * Third entry point for undo, and the only one that finds the user rather than
   * waiting to be found.
   *
   * The other two live in the conversation and in the dock, both of which assume the
   * user is looking at this tab's chat area. Plenty of the time they are in the
   * sidebar checking what the agent actually did to their folders — this reaches them
   * there. Times out on its own, because an offer nobody took is not a problem.
   */
  useEffect(() => {
    return agentEventBus.on('loop:ended', () => {
      if (!canUndo()) return;
      toast.withAction(
        i18n.t('agent.undo.toastPrompt'),
        'info',
        { label: i18n.t('agent.undo.action'), onClick: () => void runUndoFlow() },
        20000,
      );
    });
  }, []);

  // ─── Result capsule click handler (shows content in modal) ──────────

  useEffect(() => {
    const handleResultCapsuleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.bs-agent-result-capsule');
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const content = target.getAttribute('data-result-content') || '';
      showCapsuleDetailModal(t('agent.tool.resultsTitle', { defaultValue: 'Tool results' }), content);
    };

    document.addEventListener('click', handleResultCapsuleClick);
    return () => document.removeEventListener('click', handleResultCapsuleClick);
  }, []);

  // ─── Start agent loop engine ────────────────────────────────────────

  const startAgentEngine = useCallback(
    (session?: { title?: string }) => {
      const adapter = getAdapter();
      if (!adapter) {
        console.error('[AgentLoop] No adapter available for current platform');
        return;
      }
      const engine = new AgentLoopEngine(adapter);
      engineRef.current = engine;
      // Publish the instance so the Agent tab can stop / retry / continue it
      setActiveEngine(engine);
      setTimeout(
        () =>
          engine.start(20, {
            conversationId: conversationIdRef.current,
            title: session?.title,
          }),
        300,
      );
    },
    [getAdapter],
  );

  // Release the engine handle when this feature unmounts
  useEffect(() => {
    return () => {
      if (engineRef.current) clearActiveEngine(engineRef.current);
    };
  }, []);

  // ─── Auto-pickup: detect tool calls in latest response while idle ───

  const messages = useConversationMessages();

  /**
   * Which response we last picked up, as `conversation:turn:toolcalls`.
   *
   * Keyed rather than a bare "already fired" boolean, and that is the whole point: the
   * overlay is never torn down any more (conversations are switched through Gemini's
   * router, not a page load), so a boolean latch set once — on a response we then
   * declined to run, or on one in some other conversation — stayed set for the life of
   * the tab and quietly disabled pickup for every response after it. The user's next
   * message got an answer full of tool calls that nothing ever executed.
   *
   * A key re-arms by itself for a genuinely different response, while still refusing to
   * fire twice on the same one.
   */
  const pickedUpKeyRef = useRef<string | null>(null);

  /**
   * When the engine is idle but the newest AI response contains tool calls with no
   * matching results (i.e. nothing was sent back), the user continued the
   * conversation without re-triggering `>`. The AI is still talking in tool format
   * because it remembers the system prompt from the previous session.
   *
   * Automatically start a new session using the existing response element, skipping
   * the "wait for AI" stage that would never resolve (the answer is already there).
   */
  useEffect(() => {
    const status = useAgentLoopStore.getState().status;
    if (status !== 'idle') return;

    // The ledger decides whether these calls already ran, so nothing may be picked up
    // until it is here. See `recordsReady`.
    if (!recordsReady) return;

    // Find the last model turn
    const lastModel = [...messages].reverse().find((m) => m.role === 'model');
    if (!lastModel) return;
    if (!lastModel.toolCalls || lastModel.toolCalls.length === 0) return;
    // Still streaming — wait for it to finish
    if (lastModel.isStreaming) return;

    // If any outcome is already known (from the next user message), it's history
    if (lastModel.toolOutcomes.some((o) => o !== null)) return;

    /**
     * A turn that ended its session is not unfinished business.
     *
     * Neither `complete_task` nor a handoff tool ever gets its result sent back, so
     * their outcomes stay null forever and this check used to read the last turn of
     * every finished task as "tool calls nobody ran". For `complete_task` that spun up
     * a session which re-parsed the completion and ended again — the stray summary
     * card. For a handoff it is worse: re-running it books the tab for the entire sync
     * road trip a second time, which is what greeted the user on getting back from the
     * first one.
     */
    if (endsSession(lastModel)) return;

    /**
     * A sync run is driving the tab — none of these conversations were opened by the
     * user, so none of them is a follow-up.
     *
     * Pickup's whole premise is "the user kept talking and nobody ran the tools". A run
     * walks the tab through up to fifty conversations, and any one of them can end with
     * agent tool calls that were never reported back (a task the user stopped, say).
     * Without this the run's own navigation looks like fifty follow-ups: pickup starts a
     * session, executes the calls, and posts the results into a chat the user never
     * opened — then the run navigates away, leaving that session parked in a
     * conversation whose Dock won't even render (`belongsToCurrent`), so nothing on
     * screen can stop it and the tab refuses to start any new task until a reload.
     */
    if (isSyncRunActive()) return;

    /**
     * Bind to the conversation the response is actually in, read from the URL now.
     *
     * `conversationIdRef` follows a 500ms poll (`useUrl`), and this effect is driven by
     * the DOM — so on a router navigation the two disagree for a moment. Binding a
     * session to the previous conversation's id hides the dock outright
     * (`belongsToCurrent`), leaving the engine parked on an approval with no way on
     * screen to answer it.
     */
    const liveConversationId = readConversationIdFromPath() ?? conversationIdRef.current;

    const pickupKey = [
      liveConversationId ?? 'unbound',
      lastModel.id,
      ...lastModel.toolCalls.map((tc) => buildToolCallFingerprint(tc.toolCall)),
    ].join('|');
    if (pickedUpKeyRef.current === pickupKey) return;

    // Also skip if the ledger already knows these calls (current live session)
    const store = useAgentLoopStore.getState();
    const anyKnown = lastModel.toolCalls.some((tc) => {
      const fp = buildToolCallFingerprint(tc.toolCall);
      return store.executedCalls[fp] !== undefined;
    });
    if (anyKnown) return;

    /**
     * The stored ledger says these already ran. Do not run them again.
     *
     * This is the guard the whole ledger exists for. Everything above reads the page,
     * and after a reload the page looks identical whether a call ran or not: the tool
     * calls are there, no results follow them, `executedCalls` is empty. So pickup used
     * to re-execute — and for a write, that is the same statement applied twice. Worse,
     * the second run asks for approval again, on a statement the user just approved, so
     * the interface actively invites the duplicate.
     *
     * What the results actually need is delivering, which the dock offers separately
     * (see `owed`). Re-running is never the recovery.
     */
    const recorded = useAgentRecordStore.getState().records;
    const anyRecorded = lastModel.toolCalls.some(
      (tc) => recorded[buildToolCallKey(tc.toolCall)] !== undefined,
    );
    if (anyRecorded) {
      console.log('[AgentLoop] Auto-pickup skipped: these calls are in the ledger already');
      return;
    }

    // We need the actual DOM element to pass to the engine
    const adapter = getAdapter();
    if (!adapter) return;
    const responseElement = adapter.getLastAIResponseElement();
    if (!responseElement) return;

    pickedUpKeyRef.current = pickupKey;

    // The user just did the thing the end-of-task hint exists to teach — carried on
    // talking instead of retyping `>`. Nothing left to explain, so it stops appearing.
    retireOnboardingHint('agentContinueAfterEnd');

    console.log('[AgentLoop] Auto-pickup: detected unexecuted tool calls in idle state, starting session');

    const lastEntryId = [...messages].reverse().find(m => m.promptId)?.promptId;
    const kind = lastEntryId ? getAgentEntryById(lastEntryId)?.agentKind ?? 'data' : 'data';
    useBrowserAgent.getState().setRunning(kind);
    useBrowserAgent.getState().select(kind);

    const engine = new AgentLoopEngine(adapter);
    engineRef.current = engine;
    setActiveEngine(engine);
    engine.startFromExistingResponse(responseElement, 20, {
      conversationId: liveConversationId,
      title: 'Follow-up task',
    });
  }, [messages, getAdapter, recordsReady]);

  // ─── Capsule insertion (from the `>` popup) ─────────────────────────

  function handleConfirmSelection() {
    const entry = getSelectedEntryRef.current();
    if (!entry) return;
    if (entry.agentKind === 'browser' && browserEntryNeedsPermission(entry.id)) {
      close();
      void browserRequest({ action: 'open-settings' }).catch(e => toast.warning(e.message));
      return;
    }

    const adapter = getAdapter();
    const editor = adapter?.getEditor();
    if (!adapter || !editor) return;

    const triggerPos = triggerStateRef.current.triggerPosition;
    const cursorPos = adapter.getCursorPosition();

    const item: TriggerPopupItem = {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      icon: entry.icon,
      content: entry.capsuleContent,
    };

    close();
    insertCapsule(editor, triggerPos, cursorPos, item, '>');
    editor.focus();
  }

  const handleConfirmSelectionRef = useRef(handleConfirmSelection);
  handleConfirmSelectionRef.current = handleConfirmSelection;

  // ─── Compose + send (shared by Enter, send button and launcher) ─────

  const composeAndSend = useCallback(
    (editor: HTMLElement): boolean => {
      const capsule = editor.querySelector(`.${CAPSULE_CLASS}[data-trigger=">"]`);
      // No agent capsule — not our send (a `/` prompt capsule ends up here too).
      if (!capsule) return false;

      /**
       * From here on we own this send, whatever happens.
       *
       * Returning false would hand it back to the fallback path, which expands the
       * capsule in place and lets Gemini send it — i.e. it posts the raw skill
       * instructions as an ordinary chat message, with no Soul prompt, no tool
       * schemas and no `[#bs-agent:...#]` marker. That looks to the user exactly
       * like a broken skill: the AI gets a task description it has no tools for, and
       * the conversation never switches to the agent view.
       *
       * So every failure below blocks the send and says why, leaving the capsule
       * where it is so the user can retry.
       */
      const abort = (
        reason: string,
        message: string,
        /** A way out, for refusals the user can actually resolve from here */
        action?: { label: string; onClick: () => void },
      ): boolean => {
        console.warn(`[AgentLoop] Not sending: ${reason}`);
        if (!action) {
          toast.warning(message);
          return true;
        }
        // Dismissed on use: the notice is about a task that no longer exists the moment
        // the button is pressed, and a stale "already running" left on screen reads as
        // the button having done nothing.
        const id: string = toast.withAction(
          message,
          'warning',
          {
            label: action.label,
            onClick: () => {
              action.onClick();
              toast.dismiss(id);
            },
          },
          10000,
        );
        return true;
      };

      /**
       * A session is already running — do not take over this send.
       *
       * Taking over means `insertText` overwrites whatever is in the composer (which
       * may be the running engine's staged tool results) and `startAgentEngine`
       * builds a second engine. `setActiveEngine` then replaces the handle the UI
       * uses to stop the first one, and `store.start()` wipes its state, so the
       * original keeps looping with nothing able to reach it.
       */
      if (useAgentLoopStore.getState().status !== 'idle') {
        /**
         * The refusal carries the way out with it.
         *
         * Saying "finish or stop the current task first" is only actionable if the user
         * can find the task, and often they can't: a session bound to another
         * conversation hides its Dock (`belongsToCurrent`), and the Agent tab's own Stop
         * button sits behind cards that are disabled precisely because a task is
         * running. So the dead end was total — reloading the page was the only exit.
         *
         * Stop only, no auto-resend: a session parked at `awaiting_send` has its tool
         * results sitting in this very composer next to the capsule, and sending that
         * mixture would post both at once. The capsule stays put, so pressing Enter
         * again is all it takes.
         */
        return abort('a task is already running', i18n.t('agent.send.sessionBusy'), {
          label: i18n.t('agent.send.stopRunning'),
          onClick: () => {
            const engine = getActiveEngine();
            if (engine) engine.stop();
            else useAgentLoopStore.getState().stop();
          },
        });
      }

      const entryId = capsule.getAttribute(CAPSULE_ATTR_ID) || '';
      const capsuleContent = capsule.getAttribute(CAPSULE_ATTR_CONTENT) || '';
      if (!entryId) {
        return abort('capsule carries no entry id', i18n.t('agent.send.staleCapsule'));
      }

      const adapter = getAdapter();
      if (!adapter) {
        return abort('no platform adapter', i18n.t('agent.send.noEditor'));
      }

      // The auto entry has no preselected skill — the AI calls activate_skill itself
      const entry = getAgentEntryById(entryId);
      if (!entry) {
        return abort(`unknown entry "${entryId}"`, i18n.t('agent.send.staleCapsule'));
      }
      if (entry.agentKind === 'browser' && browserEntryNeedsPermission(entry.id)) {
        void browserRequest({ action: 'open-settings' }).catch(e => toast.warning(e.message));
        return abort('browser permission missing', '请先开启 Browser Agent 读取权限，然后重新发送。');
      }

      /**
       * Assembled before the editor is touched. It used to run after
       * `expandAllCapsules`, so anything throwing in here left the expanded skill
       * text sitting in the composer while the exception escaped the click handler —
       * and since nothing had called `preventDefault`, Gemini sent it.
       */
      let basePrompt: string;
      try {
        basePrompt = assembleFinalPrompt({
          agentKind: entry.agentKind,
          focus: entry.focus,
          selectedSkill: entry.skill,
          allSkills: getEnabledSkills(),
          platform: getCurrentPlatformId(),
        });
      } catch (err) {
        console.error('[AgentLoop] Prompt assembly failed', err);
        return abort('prompt assembly failed', i18n.t('agent.send.assembleFailed'));
      }

      // Expand all capsules (both / and >) to read the full editor text
      expandAllCapsules(editor);

      // Whatever the user typed around the capsule
      const editorText = editor.textContent || '';
      const userInput = capsuleContent
        ? editorText.replace(capsuleContent, '').trim()
        : editorText.trim();

      let fullMessage = `${buildPromptMarker(entryId)}\n${basePrompt}`;
      if (userInput) {
        fullMessage += `\n\n## User Request\n\n${userInput}`;
      }
      if (fullMessage.length > MAX_MESSAGE_LENGTH) {
        fullMessage = fullMessage.substring(0, MAX_MESSAGE_LENGTH);
        console.warn(`[AgentLoop] Message truncated to ${MAX_MESSAGE_LENGTH} chars`);
      }

      const title = userInput || entry.title || 'Agent task';

      adapter.insertText(fullMessage);

      /**
       * Confirm the payload actually landed before clicking send.
       *
       * The composer still holds the expanded skill instructions at this point, so a
       * staging failure doesn't leave us with an empty box to send — it leaves us
       * with the wrong message ready to go.
       */
      if (!(editor.textContent || '').includes(buildPromptMarker(entryId))) {
        console.error('[AgentLoop] Prompt did not land in the composer', {
          expectedLength: fullMessage.length,
          actualLength: (editor.textContent || '').length,
        });
        return abort('prompt did not land in the composer', i18n.t('agent.send.stagingFailed'));
      }

      // User pressed Enter / clicked send, so no artificial pause. Only start the
      // engine if the message actually went out — otherwise it would sit waiting
      // for a response to a prompt that was never delivered.
      adapter.triggerSend({ humanDelay: false }).then((sent) => {
        if (sent) {
          useBrowserAgent.getState().setRunning(entry.agentKind ?? 'data');
          useBrowserAgent.getState().select(entry.agentKind ?? 'data');
          startAgentEngine({ title });
        }
        else console.warn('[AgentLoop] Initial prompt was not sent, engine not started');
      });

      return true; // We handled sending
    },
    [getAdapter, startAgentEngine],
  );

  // ─── Editor integration (`>`) ───────────────────────────────────────

  const { popupPosition, suppressInput } = useEditorIntegration({
    getEditor: () => getAdapter()?.getEditor() || null,
    enabled: slashCommandEnabled,
    triggerChar: '>',
    onInput: (text, cursorPos) => {
      // Suppressed only while the engine's tool results are sitting in the composer.
      // Inserting a capsule there would ride along with the payload on the next send,
      // and the send interceptor would hijack it into a second session.
      //
      // Every other running state leaves the composer alone (waiting on the AI,
      // executing, waiting for approval), so `>` stays available — picking up a new
      // skill mid-conversation is a reasonable thing to want.
      if (isComposerHeldByEngine()) return;
      handleInput(text, cursorPos);
    },
    getPopupState: () => triggerStateRef.current as any,
    selectPrevious,
    selectNext,
    close,
    onConfirmSelection: () => handleConfirmSelectionRef.current(),
    onCapsuleClick: handleCapsuleClick,
    onBeforeSend: composeAndSend,
  });

  const suppressInputRef = useRef(suppressInput);
  suppressInputRef.current = suppressInput;

  // ─── Launcher bridge (Agent tab → editor) ───────────────────────────

  useEffect(() => {
    return agentEventBus.on('launcher:run-entry', async ({ entryId, userInput, autoSend }) => {
      const adapter = getAdapter();
      const editor = adapter?.getEditor();
      if (!editor) {
        agentEventBus.emit('launcher:failed', { reason: 'no-editor' });
        return;
      }

      /**
       * Nothing can be launched while a session is live: `composeAndSend` refuses to
       * start a second engine, so staging the capsule would only set the user up to
       * press send and get a warning. Two reasons, because the fix differs — staged
       * tool results need sending, a paused task needs finishing or stopping.
       */
      if (useAgentLoopStore.getState().status !== 'idle') {
        agentEventBus.emit('launcher:failed', {
          reason: isComposerHeldByEngine() ? 'composer-busy' : 'session-busy',
        });
        return;
      }

      const entry = getAgentEntryById(entryId);
      if (!entry) {
        agentEventBus.emit('launcher:failed', { reason: 'unknown-entry' });
        return;
      }

      // Inserting ">Title" would otherwise re-open the trigger popup
      suppressInputRef.current();

      await appendCapsule(editor, `>${entry.title}`, {
        className: CAPSULE_CLASS,
        dataAttrs: {
          [CAPSULE_ATTR_ID]: entry.id,
          [CAPSULE_ATTR_CONTENT]: entry.capsuleContent,
          'data-trigger': '>',
        },
      });

      if (userInput?.trim()) {
        insertTextAtEnd(editor, userInput.trim());
      }

      agentEventBus.emit('launcher:staged', { entryId, autoSend });

      if (autoSend) {
        // Route through the real send button so the interceptor composes the message
        await triggerSend({ humanDelay: false });
      } else {
        editor.focus();
      }
    });
  }, [getAdapter]);

  // ─── Recovery bridge (dock → engine) ────────────────────────────────

  /**
   * Deliver results that ran in a previous page life and never reached the AI.
   *
   * Lives here because after a reload there is no engine — the dock has a button but
   * nothing to call, exactly like the launcher. The payload is rebuilt from the stored
   * result bodies, so what goes out is what actually happened rather than a second run
   * of it.
   */
  useEffect(() => {
    return agentEventBus.on('recovery:deliver-owed', async ({ conversationId: owedIn }) => {
      const store = useAgentRecordStore.getState();
      const owed = store.owed;
      if (!owed || owed.conversationId !== owedIn) return;

      if (useAgentLoopStore.getState().status !== 'idle') {
        // A session started between the click and this handler; it owns the composer.
        toast.error(
          t('agent.owed.busy', {
            defaultValue: 'A task is already running — stop it first.',
          }),
        );
        return;
      }

      const adapter = getAdapter();
      if (!adapter?.getEditor()) {
        toast.error(
          t('agent.owed.noEditor', { defaultValue: 'Open the chat first.' }),
        );
        return;
      }

      const payload = buildOwedPayload(owed.rows);
      if (!payload) {
        // Nothing left to send — the bodies are gone, so the offer is stale.
        void store.dismissOwed();
        return;
      }

      /**
       * Clear the offer before sending, not after.
       *
       * The rows are marked delivered by the handoff once the send is confirmed, but
       * that is seconds away and the card is a button the user can press again. Two
       * presses would stage the same payload twice.
       */
      useAgentRecordStore.setState({ owed: null });
      // Browser audit is independent and never creates SQL-ledger owed rows.
      useBrowserAgent.getState().setRunning('data');

      const engine = new AgentLoopEngine(adapter);
      engineRef.current = engine;
      setActiveEngine(engine);

      const delivered = await engine.deliverOwedResults(payload, 20, {
        conversationId: owedIn,
        title: t('agent.owed.sessionTitle', { defaultValue: 'Recovered task' }),
      });

      if (!delivered) {
        // Never left the composer, so the results are still owed — put the offer back
        // rather than stranding them behind a card that is gone.
        void useAgentRecordStore.getState().load(owedIn, true);
        return;
      }

      /**
       * Settle the rows we just delivered, by id.
       *
       * The handoff's own bookkeeping marks a round of the *current* session, and these
       * rows belong to the interrupted one — so without this they would stay undelivered
       * and be re-offered on the next load, with results the AI has already read.
       */
      await useAgentRecordStore
        .getState()
        .confirmOwedDelivered(owed.rows.map((row) => row.id));
      void useAgentRecordStore.getState().load(owedIn, true);
    });
  }, [getAdapter, t]);

  // ─── Monitor slash command popup for mutual exclusion ───────────────

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const slashPopup = document.querySelector('[data-slash-command-popup]');
      setIsSlashCommandActive(!!slashPopup);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!slashCommandEnabled) return null;

  return (
    <>
      <ConversationViewSwitcher />
      <ConversationOverlay />

      {/* Everything the running loop needs from the user, docked to the composer.
          Hidden while the `>` popup is up — both anchor to the same corner. */}
      <AgentDock hidden={triggerState.isOpen} />

      {/* Agent entry popup (>) — auto entry first, then skills */}
      {triggerState.isOpen && (
        <AgentCommandPopup
          matches={triggerState.matches}
          selectedIndex={triggerState.selectedIndex}
          onHighlight={setHighlight}
          onConfirm={(index) => {
            const matches = triggerStateRef.current.matches;
            if (matches[index]) {
              suppressInput();
              setHighlight(index);
              handleConfirmSelectionRef.current();
            }
          }}
          position={popupPosition}
          query={triggerState.query}
        />
      )}
    </>
  );
};
