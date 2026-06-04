import type { Prompt } from '@/shared/types/db';
import { useAppStore } from '@/shared/lib/store/store-impl';
import {
  parsePromptVariables,
  substitutePromptVariables,
  hasImportReferences,
  resolveImports,
} from '@/shared/lib/prompt-variables';
import type { PromptVariable } from '@/shared/lib/prompt-variables';

/**
 * Resolve a prompt's content: handle @import references first,
 * then extract variables that need user input.
 */
export function resolvePromptContent(prompt: Prompt): {
  resolvedContent: string;
  variables: PromptVariable[];
} {
  let content = prompt.content || '';

  // Resolve @import references
  if (hasImportReferences(content)) {
    const allPrompts = useAppStore.getState().prompts;
    content = resolveImports(content, (title) => {
      const found = allPrompts.find((p) => p.title === title);
      return found?.content;
    });
  }

  // Extract variables (input/select only, imports already resolved)
  const variables = parsePromptVariables(content).filter((v) => v.kind !== 'import');

  return { resolvedContent: content, variables };
}

/**
 * Apply variable values to resolved content.
 */
export function applyVariables(content: string, values: Record<string, string>): string {
  return substitutePromptVariables(content, values);
}
