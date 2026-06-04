import type { Prompt } from '@/shared/types/db';

/**
 * Platform-specific adapter interface for the slash command feature.
 * Each platform (Gemini, AI Studio) implements this to interact with
 * their specific input field DOM.
 */
export interface InputFieldAdapter {
  /** Get the current text content of the input field */
  getText(): string;
  /** Set the text content of the input field */
  setText(text: string): void;
  /** Get cursor position (character offset) */
  getCursorPosition(): number;
  /** Get the input field DOM element for positioning popup */
  getInputElement(): HTMLElement | null;
  /** Focus the input field */
  focus(): void;
  /** Insert content at the current cursor position, replacing text from `start` to current cursor */
  replaceRange(start: number, end: number, content: string): void;
}

export interface SlashCommandMatch {
  prompt: Prompt;
  /** Highlight ranges in the title for the search query */
  matchRanges?: Array<[number, number]>;
}

export interface SlashCommandState {
  /** Whether the popup is currently visible */
  isOpen: boolean;
  /** The search query after the slash (without the '/') */
  query: string;
  /** Start position of the '/' character in the input */
  slashPosition: number;
  /** Matched prompts */
  matches: SlashCommandMatch[];
  /** Currently selected index in the popup */
  selectedIndex: number;
}

export interface InsertedPrompt {
  /** The prompt that was selected */
  prompt: Prompt;
  /** Resolved content (after variable substitution and import resolution) */
  resolvedContent: string;
  /** Variable values filled by the user */
  variableValues?: Record<string, string>;
}
