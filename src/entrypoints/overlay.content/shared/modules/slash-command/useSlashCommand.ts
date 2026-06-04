import { useState, useCallback } from 'react';
import { useAppStore } from '@/shared/lib/store/store-impl';
import type { Prompt } from '@/shared/types/db';
import type { SlashCommandState, SlashCommandMatch } from './types';

const MAX_RESULTS = 8;

const initialState: SlashCommandState = {
  isOpen: false,
  query: '',
  slashPosition: -1,
  matches: [],
  selectedIndex: 0,
};

/**
 * Core slash command logic — platform-agnostic.
 * Handles search matching, popup state, and keyboard navigation.
 */
export function useSlashCommand() {
  const [state, setState] = useState<SlashCommandState>(initialState);

  const prompts = useAppStore((s) => s.prompts);

  /**
   * Search prompts by title. Supports multi-word queries:
   * each word in the query must appear somewhere in the title (AND logic).
   */
  const searchPrompts = useCallback(
    (query: string): SlashCommandMatch[] => {
      if (!query) {
        // Show all prompts (up to limit) when just "/" is typed
        return prompts.slice(0, MAX_RESULTS).map((p) => ({ prompt: p }));
      }

      const lowerQuery = query.toLowerCase().trim();
      if (!lowerQuery) {
        return prompts.slice(0, MAX_RESULTS).map((p) => ({ prompt: p }));
      }

      // Split query into words for multi-word matching
      const queryWords = lowerQuery.split(/\s+/).filter(Boolean);

      const results: Array<{ prompt: Prompt; score: number; ranges: Array<[number, number]> }> = [];

      for (const prompt of prompts) {
        const title = prompt.title.toLowerCase();

        // All query words must appear in the title
        let allMatch = true;
        const ranges: Array<[number, number]> = [];
        let totalScore = 0;

        for (const word of queryWords) {
          const idx = title.indexOf(word);
          if (idx === -1) {
            allMatch = false;
            break;
          }
          ranges.push([idx, idx + word.length]);
          // Prefix match scores higher
          totalScore += idx === 0 ? 100 : 50 - Math.min(idx, 49);
        }

        if (allMatch) {
          // Sort ranges by position for highlighting
          ranges.sort((a, b) => a[0] - b[0]);
          results.push({ prompt, score: totalScore, ranges });
        }
      }

      // Sort by score descending, then alphabetically
      results.sort((a, b) => b.score - a.score || a.prompt.title.localeCompare(b.prompt.title));

      return results.slice(0, MAX_RESULTS).map((r) => ({
        prompt: r.prompt,
        matchRanges: r.ranges,
      }));
    },
    [prompts],
  );

  /** Called when user types. Detects slash and updates popup state. */
  const handleInput = useCallback(
    (text: string, cursorPos: number) => {
      // Find the '/' that starts the slash command.
      // Strategy: look backwards from cursor for '/' that is at start of text
      // or preceded by a newline. We DON'T stop at spaces because the query
      // can contain spaces (e.g. "/code review").
      // We stop when we find a newline without encountering '/' first.
      let slashPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (text[i] === '/') {
          // Valid slash: at position 0 or preceded by whitespace/newline
          if (i === 0 || /[\s\n]/.test(text[i - 1])) {
            slashPos = i;
          }
          break;
        }
        // Stop scanning if we hit a newline (slash command doesn't span lines)
        if (text[i] === '\n') break;
      }

      if (slashPos === -1) {
        setState(initialState);
        return;
      }

      const query = text.slice(slashPos + 1, cursorPos);
      const matches = searchPrompts(query);

      // If there's a query but no matches, close the popup
      if (query.trim() && matches.length === 0) {
        setState(initialState);
        return;
      }

      setState({
        isOpen: true,
        query,
        slashPosition: slashPos,
        matches,
        selectedIndex: 0,
      });
    },
    [searchPrompts],
  );

  /** Move selection up */
  const selectPrevious = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex: prev.selectedIndex <= 0 ? prev.matches.length - 1 : prev.selectedIndex - 1,
    }));
  }, []);

  /** Move selection down */
  const selectNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex: prev.selectedIndex >= prev.matches.length - 1 ? 0 : prev.selectedIndex + 1,
    }));
  }, []);

  /** Update highlight (mouse hover) without triggering selection */
  const setHighlight = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: index,
    }));
  }, []);

  /** Close the popup */
  const close = useCallback(() => {
    setState(initialState);
  }, []);

  /** Get the currently selected prompt */
  const getSelectedPrompt = useCallback((): Prompt | null => {
    if (!state.isOpen || state.matches.length === 0) return null;
    return state.matches[state.selectedIndex]?.prompt ?? null;
  }, [state]);

  return {
    state,
    handleInput,
    selectPrevious,
    selectNext,
    setHighlight,
    close,
    getSelectedPrompt,
  };
}
