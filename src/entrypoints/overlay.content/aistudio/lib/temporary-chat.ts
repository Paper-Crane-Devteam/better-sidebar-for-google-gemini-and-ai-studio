import { navigate } from '@/shared/lib/navigation';

const NEW_CHAT_URL = 'https://aistudio.google.com/prompts/new_chat';

/**
 * Tell the main world whether the next created prompt is a temporary chat.
 *
 * A DOM CustomEvent is the only bridge between the overlay's JS context and the
 * main world, which is where CreatePrompt is intercepted and where the row-creating
 * event originates. Mirrors BETTER_SIDEBAR_SET_PENDING_TITLE.
 */
const setTemporaryIntent = (temporary: boolean) => {
  window.dispatchEvent(
    new CustomEvent('BETTER_SIDEBAR_SET_TEMP_CHAT', { detail: { temporary } }),
  );
};

/**
 * Start a temporary chat on AI Studio.
 *
 * AI Studio has no native equivalent of Gemini's temporary chat, so this is ours:
 * the prompt is still created and Google still keeps it in the user's Drive — we
 * only keep it out of the sidebar. That difference is why this action's tooltip
 * spells out what is and is not private.
 *
 * The intent is set before navigating, so it is already in place by the time the
 * user sends their first message and CreatePrompt fires. The main world consumes it
 * one-shot, so nothing has to clear it on the happy path.
 */
export const startAiStudioTemporaryChat = () => {
  setTemporaryIntent(true);
  navigate(NEW_CHAT_URL);
};

/**
 * Withdraw a pending temporary-chat intent.
 *
 * Called when the user asks for a normal new chat, which is the realistic way to
 * change your mind after right-clicking: the intent would otherwise survive and
 * quietly hide the *next* chat instead. Deliberately not wired to navigation —
 * AI Studio rewrites the URL from `/prompts/new_chat` to `/prompts/<id>` at
 * roughly the same time CreatePrompt returns, so cancelling on route change would
 * race the very creation it is meant to classify.
 */
export const cancelAiStudioTemporaryChat = () => {
  setTemporaryIntent(false);
};

export const navigateToAiStudioNewChat = () => {
  cancelAiStudioTemporaryChat();
  navigate(NEW_CHAT_URL);
};
