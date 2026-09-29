import { initializeBrowserAgent } from '@/entrypoints/overlay.content/shared/modules/agent-loop/browser/browser-store';
/**
 * AgentLoopFeature — AI Studio entry point for Agent Loop.
 *
 * Same flow as the Gemini one, with a single structural difference: AI Studio's composer
 * is a plain `<textarea>`, so the staged entry is **plain text** (`>Entry title`) instead
 * of a capsule node carrying data attributes.
 *
 * That changes where the truth lives. On Gemini the entry id is on the capsule element;
 * here it is recovered from the text itself via `matchAgentEntryInText`. Deliberately
 * stateless: React state alongside the text would be lost on a remount while the marker
 * stayed in the composer, and the next send would post the raw `>Title` line as an
 * ordinary chat message — a failure that is invisible to the user and looks exactly like
 * a broken skill.
 *
 * Flow:
 * 1. User types `>` → the entry popup opens
 * 2. Selecting an entry writes `>Entry title ` into the composer
 * 3. User optionally types the task after it
 * 4. On send (Run button *or* Enter) → composeAndSend() builds the full prompt, sends it,
 *    and starts the engine
 * 5. Engine watches the response, parses tool calls, loops
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import {
  AgentCommandPopup,
  AgentLoopEngine,
  useAgentTrigger,
  useAgentLoopStore,
  buildPromptMarker,
  setActiveEngine,
  clearActiveEngine,
  getActiveEngine,
  agentEventBus,
  ConversationOverlay,
  ConversationViewSwitcher,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop';
import type { AgentPlatformAdapter } from '@/entrypoints/overlay.content/shared/modules/agent-loop';
import { AgentDock, AgentQuickPrompts } from '@/entrypoints/overlay.content/shared/modules/agent-dock';
import { canUndo, runUndoFlow } from '@/entrypoints/overlay.content/shared/modules/agent-loop/undo';
import {
  getAgentEntryById,
  matchAgentEntryInText,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop/agent-entry';
import {
  createAdapterForCurrentPlatform,
  getCurrentPlatformId,
} from '@/entrypoints/overlay.content/shared/modules/agent-loop/adapters/adapter-factory';
import { assembleFinalPrompt } from '@/entrypoints/overlay.content/shared/modules/agent-loop/prompts/prompt-assembler';
import { buildInitialMessage } from '@/entrypoints/overlay.content/shared/modules/agent-loop/prompts/initial-message';
import type { AgentId } from '@/entrypoints/overlay.content/shared/modules/agent-loop/agents/types';
import { initMCPRegistry } from '@/entrypoints/overlay.content/shared/modules/agent-loop/mcp/setup';
import { resolveAgentForRecoveredSession } from '@/entrypoints/overlay.content/shared/modules/agent-loop/conversation-agent';
import { RESULT_OPEN_TAG } from '@/entrypoints/overlay.content/shared/modules/agent-loop/engine';
import { useAgentRecordStore } from '@/entrypoints/overlay.content/shared/modules/agent-loop/agent-record-store';
import { buildOwedPayload } from '@/entrypoints/overlay.content/shared/modules/agent-loop/recovery';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { useAutoPickup } from '@/entrypoints/overlay.content/shared/modules/agent-loop/pickup';
import { useAIStudioLastModelTurn } from './useAIStudioLastModelTurn';
import {
  getTextarea,
  insertTextAtEnd,
  replaceRange,
  setValue,
  triggerRun,
} from '@/entrypoints/overlay.content/shared/lib/aistudio-editor';
import { useAIStudioEditorIntegration } from './useAIStudioEditorIntegration';

// See the note in the Gemini feature: the ceiling and the truncation policy both live in
// `prompts/initial-message.ts` now, instead of a `30000` copied into each platform.

/**
 * Whether the engine currently owns the chat input.
 *
 * True exactly while stage ④ has a payload staged there: `sending` (about to click send
 * itself) and `awaiting_send` (waiting for the user to press Enter). Both are states
 * where anything the user adds gets sent as part of the tool results.
 */
function isComposerHeldByEngine(): boolean {
  const status = useAgentLoopStore.getState().status;
  return status === 'sending' || status === 'awaiting_send';
}

export const AgentLoopFeature: React.FC = () => {
  useEffect(initializeBrowserAgent, []);
  const { t } = useI18n();
  /**
   * Whether typing `>` in the composer may open the agent launcher.
   *
   * Only the trigger is gated. The run interceptor, the Agent tab launcher, the dock and
   * the conversation renderer stay mounted, so switching this off means "stop reacting to
   * `>` while I type" rather than "abandon the running session".
   *
   * Read separately from `slashCommand`, which this used to piggyback on — `/` prompts and
   * `>` agents are independent features and are now switched independently.
   */
  const agentTriggerEnabled = usePegasusStore(
    (s) => s.enhancedFeatures.aistudio?.agentTrigger ?? true,
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

  const triggerStateRef = useRef(triggerState);
  triggerStateRef.current = triggerState;
  const getSelectedEntryRef = useRef(getSelectedEntry);
  getSelectedEntryRef.current = getSelectedEntry;

  /**
   * Load the tool call ledger for whichever conversation is open — the Dock's recovery
   * card reads it, and it has to work with the sidebar closed.
   */
  const loadRecords = useAgentRecordStore((s) => s.load);
  useEffect(() => {
    void loadRecords(conversationId);
  }, [conversationId, loadRecords]);

  /**
   * Whether the ledger for *this* conversation has arrived. Auto-pickup must not run
   * before it does — see `planPickup`, which reads it to decide whether a write in the
   * response has already been executed once.
   *
   * Compared against the store's own `conversationId`, so a navigation that outpaces the
   * query reads as "not ready" rather than as "nothing recorded".
   */
  const recordsReady = useAgentRecordStore(
    (s) => !s.loading && s.conversationId === conversationId,
  );

  useEffect(() => {
    initMCPRegistry();
  }, []);

  // ─── Auto-pickup: detect tool calls in latest response while idle ───

  /**
   * The user finished a task, then kept typing instead of retyping `>`; the AI answered in
   * tool format anyway. Without this nothing executes those calls and the dock never
   * appears, because no session ever starts.
   *
   * All the reasoning is in `agent-loop/pickup.ts`, shared with Gemini. The only part
   * that is AI Studio's is reading the turn, which has to cope with virtualisation.
   */
  useAutoPickup({
    turn: useAIStudioLastModelTurn(),
    recordsReady,
    fallbackConversationId: conversationId,
    getAdapter,
    onEngineStarted: (engine) => {
      engineRef.current = engine;
    },
  });

  // ─── Undo prompt when a session ends having changed data ────────────

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

  // ─── Start agent loop engine ────────────────────────────────────────

  const startAgentEngine = useCallback(
    (session?: { title?: string; agentId?: AgentId }) => {
      const adapter = getAdapter();
      if (!adapter) {
        console.error('[AgentLoop] No adapter available for current platform');
        return;
      }
      const engine = new AgentLoopEngine(adapter);
      engineRef.current = engine;
      // Publish the instance so the Dock can stop / retry / continue it
      setActiveEngine(engine);
      setTimeout(
        () =>
          engine.start(20, {
            conversationId: conversationIdRef.current,
            title: session?.title,
            // Carried into the store, where the tool layer reads it to refuse tools this
            // agent does not own. It has to be the same agent the prompt was built from.
            agentId: session?.agentId,
          }),
        300,
      );
    },
    [getAdapter],
  );

  useEffect(() => {
    return () => {
      if (engineRef.current) clearActiveEngine(engineRef.current);
    };
  }, []);

  // ─── Marker insertion (from the `>` popup) ──────────────────────────

  function handleConfirmSelection() {
    const entry = getSelectedEntryRef.current();
    const textarea = getTextarea();
    if (!entry || !textarea) return;

    // An agent that cannot run yet resolves its own blocker — for the Browser agent, that
    // opens the permission window — instead of writing a marker that could only fail at send
    // time, several steps away from the thing the user has to fix.
    const blocked = entry.agent.unavailable?.();
    if (blocked) {
      close();
      blocked.resolve();
      return;
    }

    const triggerPos = triggerStateRef.current.triggerPosition;
    const cursorPos = textarea.selectionStart;

    close();
    // Trailing space so whatever the user types next is not read as part of the title
    replaceRange(textarea, triggerPos, cursorPos, `>${entry.title} `);
    textarea.focus();
  }

  const handleConfirmSelectionRef = useRef(handleConfirmSelection);
  handleConfirmSelectionRef.current = handleConfirmSelection;

  // ─── Compose + send (shared by Enter, Run button and launcher) ──────

  const composeAndSend = useCallback((): boolean => {
    const textarea = getTextarea();
    if (!textarea) return false;

    const text = textarea.value;

    /**
     * The engine's own tool results are staged here as plain text (no capsules on a
     * textarea), and this is the user pressing Enter to send them. Hand it straight back:
     * the send watcher is already armed and will see the payload leave.
     *
     * Checked first, before looking for a marker, because a result body can legitimately
     * contain a line that looks like one (markdown quotes a heading, say). Matching there
     * would take us into the `status !== 'idle'` branch below and *block* the very send
     * the running loop is waiting for.
     */
    if (text.includes(RESULT_OPEN_TAG)) return false;

    /**
     * Popup open means Enter is "confirm the highlighted entry", not "send".
     *
     * Needed because the run interceptor listens on `document` in the capture phase, so
     * it sees the keypress *before* the popup's own handler on the textarea. Returning
     * false leaves the event unprevented, and the popup handler then does its job.
     */
    if (triggerStateRef.current.isOpen) return false;

    const match = matchAgentEntryInText(text);
    // No marker — an ordinary message. Not our send.
    if (!match) return false;

    /**
     * From here on we own this send, whatever happens.
     *
     * Returning false would let AI Studio post the raw `>Entry title` line plus whatever
     * the user typed — no Soul prompt, no tool schemas, no `[#bs-agent:...#]` marker.
     * That looks exactly like a broken skill: the AI gets a task description it has no
     * tools for, and nothing about the failure is visible. So every failure below blocks
     * the send and says why, leaving the marker in place so the user can retry.
     */
    const abort = (
      reason: string,
      message: string,
      action?: { label: string; onClick: () => void },
    ): boolean => {
      console.warn(`[AgentLoop] Not sending: ${reason}`);
      if (!action) {
        toast.warning(message);
        return true;
      }
      // Dismissed on use: the notice is about a task that no longer exists the moment the
      // button is pressed, and a stale "already running" reads as the button doing nothing.
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
     * A session is already running — do not take over this send. Starting a second engine
     * would replace the handle the UI uses to stop the first one, and wipe its state,
     * leaving the original looping with nothing able to reach it.
     *
     * The refusal carries the way out with it: a session bound to another conversation
     * hides its Dock, so "finish or stop the current task first" is otherwise not
     * actionable. Stop only, no auto-resend — a session parked at `awaiting_send` has its
     * results in this very composer, and sending that mixture would post both at once.
     */
    if (useAgentLoopStore.getState().status !== 'idle') {
      return abort('a task is already running', i18n.t('agent.send.sessionBusy'), {
        label: i18n.t('agent.send.stopRunning'),
        onClick: () => {
          const engine = getActiveEngine();
          if (engine) engine.stop();
          else useAgentLoopStore.getState().stop();
        },
      });
    }

    const adapter = getAdapter();
    if (!adapter) {
      return abort('no platform adapter', i18n.t('agent.send.noEditor'));
    }

    const entry = match.entry;

    // Checked again here: a marker typed by hand never passed the check above, and a permission
    // can be revoked from Chrome's own UI between picking the row and pressing send.
    const blocked = entry.agent.unavailable?.();
    if (blocked) {
      blocked.resolve();
      // Already localized — the same sentence the `>` row shows.
      return abort(`${entry.agent.id} agent unavailable`, blocked.reason);
    }

    /**
     * Assembled before the composer is touched. The other order means a throw in here
     * leaves a half-rewritten composer behind while the exception escapes the handler —
     * and since nothing has called `preventDefault` yet, AI Studio sends it.
     */
    let basePrompt: string;
    try {
      basePrompt = assembleFinalPrompt({
        agentId: entry.agent.id,
        platform: getCurrentPlatformId(),
      });
    } catch (err) {
      console.error('[AgentLoop] Prompt assembly failed', err);
      return abort('prompt assembly failed', i18n.t('agent.send.assembleFailed'));
    }

    // Whatever the user typed around the marker
    const userInput = (text.slice(0, match.start) + text.slice(match.end)).trim();

    // ⚠️ Not `substring(0, MAX)` on the assembled message. The user's request is appended
    // last, so cutting from the end removes the task and keeps the instructions — see
    // `prompts/initial-message.ts`.
    const { text: fullMessage } = buildInitialMessage({
      marker: buildPromptMarker(entry.id),
      basePrompt,
      userInput,
    });

    const title = userInput || entry.title || 'Agent task';

    adapter.insertText(fullMessage);

    /**
     * Confirm the payload actually landed before sending. Angular owns this textarea's
     * value, so a write that bypasses its model leaves the *old* text ready to go out —
     * a staging failure here doesn't mean an empty box, it means the wrong message.
     */
    if (!(getTextarea()?.value || '').includes(buildPromptMarker(entry.id))) {
      console.error('[AgentLoop] Prompt did not land in the composer', {
        expectedLength: fullMessage.length,
        actualLength: (getTextarea()?.value || '').length,
      });
      return abort('prompt did not land in the composer', i18n.t('agent.send.stagingFailed'));
    }

    // User pressed Enter / clicked Run, so no artificial pause. Only start the engine if
    // the message actually went out — otherwise it would sit waiting for a response to a
    // prompt that was never delivered.
    adapter.triggerSend({ humanDelay: false }).then((sent) => {
      if (sent) startAgentEngine({ title, agentId: entry.agent.id });
      else console.warn('[AgentLoop] Initial prompt was not sent, engine not started');
    });

    return true; // We handled sending
  }, [getAdapter, startAgentEngine]);

  // ─── Editor integration (`>`) ───────────────────────────────────────

  /**
   * Kept `true` on purpose, even when the `>` trigger is switched off.
   *
   * `enabled: false` tears the integration down, and with it the `onBeforeSend`
   * registration — the one thing that turns a staged `>Entry title` line into a real agent
   * prompt. Launching from the Agent tab never touches the trigger, so a torn-down
   * integration would post those launches as raw skill text. The trigger is refused in
   * `onInput` below instead.
   */
  const { popupPosition } = useAIStudioEditorIntegration({
    getTextarea,
    enabled: true,
    triggerChar: '>',
    onInput: (text, cursorPos) => {
      // Switched off: `>` is just a character the user typed.
      if (!agentTriggerEnabled) return;
      // Suppressed only while the engine's tool results are sitting in the composer:
      // a marker inserted there would ride along with the payload on the next send, and
      // the interceptor would hijack it into a second session. Every other running state
      // leaves the composer alone, so `>` stays available.
      if (isComposerHeldByEngine()) return;
      handleInput(maskEntryMarker(text), cursorPos);
    },
    getPopupState: () => triggerStateRef.current as any,
    selectPrevious,
    selectNext,
    close,
    onConfirmSelection: () => handleConfirmSelectionRef.current(),
    onBeforeSend: () => composeAndSend(),
  });

  // ─── Quick prompts (row above the composer) ─────────────────────────

  // The marker is plain text here, so both halves recover it from the value itself —
  // the same self-describing lookup the send path uses.
  // Only while the marker is followed by exactly one space — the state picking from the
  // popup leaves behind.
  const readStagedAgent = useCallback((): AgentId | null => {
    const text = getTextarea()?.value;
    if (!text) return null;
    const match = matchAgentEntryInText(text);
    if (!match || !/^[\u00A0 ]$/.test(text.slice(match.end))) return null;
    return match.entry.agent.id;
  }, []);

  const fillQuickPrompt = useCallback((text: string) => {
    const textarea = getTextarea();
    if (!textarea) return;
    const match = matchAgentEntryInText(textarea.value);
    if (!match) return;
    // Keep the marker and whatever precedes it; replace what follows. Cursor lands at the end.
    setValue(textarea, `${textarea.value.slice(0, match.end)} ${text}`);
    textarea.focus();
  }, []);

  // ─── Launcher bridge (Agent tab → composer) ─────────────────────────

  useEffect(() => {
    return agentEventBus.on('launcher:run-entry', async ({ entryId, userInput, autoSend }) => {
      const textarea = getTextarea();
      if (!textarea) {
        agentEventBus.emit('launcher:failed', { reason: 'no-editor' });
        return;
      }

      /**
       * Nothing can be launched while a session is live: `composeAndSend` refuses to start
       * a second engine, so staging a marker would only set the user up to press send and
       * get a warning. Two reasons, because the fix differs — staged tool results need
       * sending, a paused task needs finishing or stopping.
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

      const separator = textarea.value && !/\s$/.test(textarea.value) ? ' ' : '';
      insertTextAtEnd(`${separator}>${entry.title} `);
      if (userInput?.trim()) {
        insertTextAtEnd(userInput.trim());
      }

      agentEventBus.emit('launcher:staged', { entryId, autoSend });

      if (autoSend) {
        // Route through the real Run button so the interceptor composes the message
        await triggerRun({ humanDelay: false });
      } else {
        textarea.focus();
      }
    });
  }, []);

  // ─── Recovery bridge (dock → engine) ────────────────────────────────

  /**
   * Deliver results that ran in a previous page life and never reached the AI.
   *
   * Lives here because after a reload there is no engine — the dock has a button but
   * nothing to call. The payload is rebuilt from the stored result bodies, so what goes
   * out is what actually happened rather than a second run of it.
   */
  useEffect(() => {
    return agentEventBus.on('recovery:deliver-owed', async ({ conversationId: owedIn }) => {
      const store = useAgentRecordStore.getState();
      const owed = store.owed;
      if (!owed || owed.conversationId !== owedIn) return;

      if (useAgentLoopStore.getState().status !== 'idle') {
        toast.error(
          t('agent.owed.busy', { defaultValue: 'A task is already running — stop it first.' }),
        );
        return;
      }

      const adapter = getAdapter();
      if (!adapter?.getEditor()) {
        toast.error(t('agent.owed.noEditor', { defaultValue: 'Open the chat first.' }));
        return;
      }

      const payload = buildOwedPayload(owed.rows);
      if (!payload) {
        // Nothing left to send — the bodies are gone, so the offer is stale.
        void store.dismissOwed();
        return;
      }

      // Cleared before sending, not after: the card is a button the user can press again,
      // and the rows are only marked delivered seconds later.
      useAgentRecordStore.setState({ owed: null });

      const engine = new AgentLoopEngine(adapter);
      engineRef.current = engine;
      setActiveEngine(engine);

      const delivered = await engine.deliverOwedResults(payload, 20, {
        conversationId: owedIn,
        title: t('agent.owed.sessionTitle', { defaultValue: 'Recovered task' }),
        // The rounds after the delivery continue the interrupted task and need the tools
        // it was using, so the agent has to be recovered rather than defaulted.
        agentId: resolveAgentForRecoveredSession(
          owed.rows.flatMap((row) => (row.tool_name ? [row.tool_name] : [])),
        ),
      });

      if (!delivered) {
        // Never left the composer, so the results are still owed — put the offer back
        // rather than stranding them behind a card that is gone.
        void useAgentRecordStore.getState().load(owedIn, true);
        return;
      }

      // Settled by row id: these rows belong to the *interrupted* session, so marking by
      // session+round would miss them and re-offer results the AI has already read.
      await useAgentRecordStore.getState().confirmOwedDelivered(owed.rows.map((row) => row.id));
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

  // Switched off while the popup was up — close it rather than leaving a list on screen
  // that no keystroke can reach any more.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!agentTriggerEnabled) closeRef.current();
  }, [agentTriggerEnabled]);

  return (
    <>
      <ConversationViewSwitcher />
      <ConversationOverlay />

      {/* Everything the running loop needs from the user, docked to the composer.
          Hidden while the `>` popup is up — both anchor to the same corner. */}
      <AgentDock hidden={triggerState.isOpen} />

      {/* Short starters for the agent just staged in the composer */}
      <AgentQuickPrompts
        readStagedAgent={readStagedAgent}
        onPick={fillQuickPrompt}
        hidden={triggerState.isOpen || isSlashCommandActive}
      />

      {/* Agent entry popup (>) — auto entry first, then skills */}
      {triggerState.isOpen && (
        <AgentCommandPopup
          matches={triggerState.matches}
          selectedIndex={triggerState.selectedIndex}
          onHighlight={setHighlight}
          onConfirm={(index) => {
            const matches = triggerStateRef.current.matches;
            if (matches[index]) {
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

/**
 * Blank out an already-inserted `>Entry title` marker before the trigger detector sees
 * the text.
 *
 * Without this the marker's own `>` re-opens the popup on every keystroke that follows
 * it: the detector scans backwards from the cursor for the trigger char and finds ours.
 * Gemini avoids the problem by keeping the marker in a capsule element and walking around
 * it (`getTextExcludingCapsules`); a textarea has nothing to walk around, so the same
 * trick is played on the string.
 *
 * Zero-width spaces rather than deletion, so every offset after the marker still lines up
 * with the real cursor position.
 */
function maskEntryMarker(text: string): string {
  const match = matchAgentEntryInText(text);
  if (!match) return text;
  return (
    text.slice(0, match.start) +
    '\u200B'.repeat(match.end - match.start) +
    text.slice(match.end)
  );
}
