import { useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import { browser } from 'wxt/browser';

/**
 * Shortest query worth a database round-trip.
 *
 * Two, not three: a two-character CJK word is an ordinary search, and the Search
 * tab answers it (below three characters the repo swaps FTS for `LIKE '%x%'`). Any
 * higher floor here and the palette silently finds nothing for queries that work
 * fine one tab over. A single character is left out — it scans the whole table to
 * match almost every message, on every keystroke.
 */
const MIN_QUERY_LENGTH = 2;
/** Typing pause before the query is sent. Roughly one keystroke's worth. */
const DEBOUNCE_MS = 180;

/** A message row as `messageRepo.search` returns it, narrowed to what we render. */
export interface MessageHit {
  id: string;
  conversation_id: string;
  conversation_title: string | null;
  content: string | null;
  role: 'user' | 'model';
  timestamp: number;
  folder_name?: string | null;
  external_url?: string;
  platform?: string;
  scroll_index?: number;
}

export interface MessageSearchState {
  hits: MessageHit[];
  isSearching: boolean;
}

/**
 * Full-text search over message bodies, for the palette.
 *
 * Unlike the rest of the palette this is asynchronous: bodies live in SQLite, not
 * in the store. Two guards keep that from showing:
 *
 * - Responses are stamped with the request that asked for them, so an early slow
 *   query cannot overwrite a later fast one.
 * - Hits are returned only while the query that produced them is still the one in
 *   the box, so a stale excerpt is never highlighted against new input.
 *
 * No folder, role or platform filters are applied. The palette is a "find it now"
 * surface; the Search tab is where narrowing lives.
 */
export function useMessageSearch(query: string): MessageSearchState {
  const trimmed = query.trim();
  const [result, setResult] = useState<{ query: string; hits: MessageHit[] }>({
    query: '',
    hits: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const latestRequest = useRef(0);

  const search = useMemo(
    () =>
      debounce(async (q: string, requestId: number) => {
        try {
          const response = await browser.runtime.sendMessage({
            type: 'SEARCH_MESSAGES',
            payload: { query: q, options: {} },
          });
          if (requestId !== latestRequest.current) return;
          // Every row is kept. The response is already capped by the repo, and
          // trimming it here would cut before the per-chat dedupe upstream: rows
          // arrive newest-first, so a burst of hits inside one busy chat would
          // push every other chat out of the list entirely.
          setResult({ query: q, hits: response?.success ? (response.data ?? []) : [] });
        } catch (e) {
          if (requestId !== latestRequest.current) return;
          console.error('Better Sidebar: command palette message search failed', e);
          setResult({ query: q, hits: [] });
        } finally {
          if (requestId === latestRequest.current) setIsSearching(false);
        }
      }, DEBOUNCE_MS),
    [],
  );

  useEffect(() => {
    const requestId = ++latestRequest.current;

    if (trimmed.length < MIN_QUERY_LENGTH) {
      search.cancel();
      setIsSearching(false);
      setResult({ query: '', hits: [] });
      return;
    }

    setIsSearching(true);
    search(trimmed, requestId);
  }, [trimmed, search]);

  useEffect(() => () => search.cancel(), [search]);

  return {
    hits: result.query === trimmed ? result.hits : [],
    isSearching,
  };
}
