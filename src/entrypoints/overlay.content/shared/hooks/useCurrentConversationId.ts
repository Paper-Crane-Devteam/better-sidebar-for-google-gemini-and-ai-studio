import { useUrl } from '@/shared/hooks/useUrl';
import { detectPlatform, Platform } from '@/shared/types/platform';

/**
 * Google prefixes the path with `/u/{n}` once more than one account is signed in.
 */
const ACCOUNT_PREFIX = String.raw`(?:/u/\d+)?`;

/**
 * pathname → conversation id, per platform.
 *
 * Matched against the pathname instead of the whole URL. The previous version built
 * its regex by interpolating `promptUrlTemplate()` — an absolute URL — so anything
 * sitting between the host and the known segment broke the match: on
 * `gemini.google.com/u/1/app/{id}` every caller got `null`, which silently disables
 * per-conversation state (the view-mode override, session scoping, the active row in
 * the sidebar) rather than failing visibly.
 */
const CONVERSATION_PATH_PATTERNS: Partial<Record<Platform, RegExp[]>> = {
  // /gem/{gemId}/{convoId} first: the second segment is the conversation, not the Gem
  [Platform.GEMINI]: [
    new RegExp(`^${ACCOUNT_PREFIX}/gem/[^/]+/([a-zA-Z0-9_-]+)`),
    new RegExp(`^${ACCOUNT_PREFIX}/app/([a-zA-Z0-9_-]+)`),
  ],
  [Platform.AI_STUDIO]: [
    new RegExp(`^${ACCOUNT_PREFIX}(?:/app)?/prompts/([a-zA-Z0-9_-]+)`),
  ],
  [Platform.CHATGPT]: [new RegExp(`^${ACCOUNT_PREFIX}/c/([a-zA-Z0-9_-]+)`)],
  [Platform.CLAUDE]: [new RegExp(`^${ACCOUNT_PREFIX}/chat/([a-zA-Z0-9_-]+)`)],
};

/**
 * Path segments that sit where a conversation id goes but are routes, not ids.
 *
 * ⚠️ These must resolve to `null`, not to themselves, and the reason is not cosmetic.
 * A whole mechanism keys on `null` meaning "this session isn't bound to a conversation
 * yet, adopt whatever id the platform assigns after the first message"
 * (`attachSessionConversation` → `toolCallRecorder.claimConversation`, and
 * `belongsToCurrent` in `AgentDock`). A *non-null* placeholder satisfies none of those
 * checks and defeats all of them: the session binds to `'new_chat'`, AI Studio then
 * navigates to `/prompts/{realId}`, and from that moment `belongsToCurrent` is false
 * forever — the Dock renders nothing, so an approval has nowhere to be answered and the
 * engine sits in `awaiting_approval` for good. Reads auto-run, so the first thing the
 * user notices is a write that silently never asks.
 *
 * Gemini has no equivalent: a new chat there is `/app` with nothing after it, so the
 * pattern simply doesn't match and `null` falls out on its own.
 */
export const RESERVED_CONVERSATION_SEGMENTS: Partial<Record<Platform, readonly string[]>> = {
  [Platform.AI_STUDIO]: ['new_chat'],
};

/**
 * The same read, without React.
 *
 * `useUrl` notices router navigations through a 500ms poll, so the hook's value lags
 * the address bar for up to half a second. That is fine for rendering and wrong for
 * anything that binds state to a conversation at a particular instant — a session
 * bound to the id we *used to* be on is a session the UI will hide as belonging
 * elsewhere. Those callers read the path directly.
 */
export const readConversationIdFromPath = (
  path: string = globalThis.location?.pathname ?? '',
): string | null => {
  const platform = detectPlatform();
  const reserved = RESERVED_CONVERSATION_SEGMENTS[platform] ?? [];

  for (const pattern of CONVERSATION_PATH_PATTERNS[platform] ?? []) {
    const match = pattern.exec(path);
    if (!match) continue;
    return reserved.includes(match[1]) ? null : match[1];
  }

  return null;
};

export const useCurrentConversationId = () => {
  const { path } = useUrl();
  return readConversationIdFromPath(path);
};
