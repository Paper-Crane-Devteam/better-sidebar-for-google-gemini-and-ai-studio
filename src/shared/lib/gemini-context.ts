/**
 * Unified Gemini conversation context detection.
 *
 * A chat on gemini.google.com can live inside one of three contexts:
 *   - plain conversation (/app/<id> or /app)
 *   - gem chat         (/gem/<gemId> or /gem/<gemId>/<convId>)
 *   - notebook chat    (URL is /app/<convId> same as plain, but the
 *                       StreamGenerate request payload contains
 *                       "notebooks/<uuid>" at innerJson[21])
 *
 * Previously gem detection was scattered across multiple files and notebook
 * support was missing (causing notebook chats to be misclassified as gems).
 * This helper is the single source of truth.
 */

export type GeminiContextType = 'conversation' | 'gem' | 'notebook';

export interface GeminiContext {
  type: GeminiContextType;
  /** Short gem id when type === 'gem' */
  gemId: string | null;
  /** Notebook uuid (without the `notebooks/` prefix) when type === 'notebook' */
  notebookId: string | null;
}

const GEM_RE = /\/gem\/([^/?#]+)/;
// The notebook id segment in the URL is URL-encoded as `notebooks%2F<uuid>`.
// We also tolerate a decoded form just in case.
const NOTEBOOK_RE = /\/notebook\/(?:notebooks%2F|notebooks\/)([^/?#]+)/i;

/**
 * Full context detection.
 *
 * Priority:
 *   1. URL says /gem/<id>                → gem
 *   2. URL says /notebook/...            → notebook (management page)
 *   3. requestNotebookId is provided     → notebook (chat inside notebook,
 *                                          extracted from request payload)
 *   4. Otherwise                         → conversation
 */
export function detectGeminiContext(
  pathname: string,
  requestNotebookId?: string | null,
): GeminiContext {
  // 1. Check URL for gem
  const gemMatch = GEM_RE.exec(pathname);
  if (gemMatch) {
    return { type: 'gem', gemId: gemMatch[1], notebookId: null };
  }

  // 2. Check URL for notebook management page
  const notebookMatch = NOTEBOOK_RE.exec(pathname);
  if (notebookMatch) {
    return { type: 'notebook', gemId: null, notebookId: notebookMatch[1] };
  }

  // 3. Check notebook id extracted from request payload
  if (requestNotebookId) {
    return { type: 'notebook', gemId: null, notebookId: requestNotebookId };
  }

  // 4. Plain conversation
  return { type: 'conversation', gemId: null, notebookId: null };
}

/**
 * Given a raw parent-id value read from a Gemini API chat list entry
 * (typically chatItem[7]), figure out whether it refers to a gem or a
 * notebook. Notebook ids are transmitted as `notebooks/<uuid>`.
 */
export function classifyChatParentId(raw: unknown): {
  gemId: string | null;
  notebookId: string | null;
} {
  if (typeof raw !== 'string' || !raw) {
    return { gemId: null, notebookId: null };
  }
  if (raw.startsWith('notebooks/')) {
    return { gemId: null, notebookId: raw.slice('notebooks/'.length) };
  }
  return { gemId: raw, notebookId: null };
}
