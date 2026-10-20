/**
 * Prompt library ↔ native instruction inputs on Gemini:
 *
 * - Gem create/edit page: toolbar in the "Instructions" header, `/` in the editor
 * - Notebook settings dialog: toolbar next to the "Instructions" label, `/` in the textarea
 *
 * Fill = pick from the prompt library (appended when the box already has text).
 * Save = current content → new prompt.
 */
import React, { useMemo } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { getGemInstructionEditor } from '@/entrypoints/overlay.content/shared/lib/quill-editor';
import { InjectedHost } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InjectedHost';
import { InstructionToolbar } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InstructionToolbar';
import {
  QuillInstructionSlash,
  TextareaInstructionSlash,
} from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/InstructionSlashCommand';
import {
  createQuillTarget,
  createTextareaTarget,
} from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/targets';

// ─── Gem ─────────────────────────────────────────────────────────────────────

/** Header row above the Gem instructions editor ("Instructions ⓘ") */
function findGemInstructionsHeader(): Element | null {
  if (!getGemInstructionEditor()) return null;
  return document.querySelector('.instructions-header');
}

function getGemName(): string {
  return document.querySelector<HTMLInputElement>('#gem-name-input')?.value ?? '';
}

// ─── Notebook ────────────────────────────────────────────────────────────────

const NOTEBOOK_DIALOG = 'project-instructions-editor';

function getNotebookTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(`${NOTEBOOK_DIALOG} textarea`);
}

/** The "Instructions / Tell Gemini how to respond…" label block in the dialog */
function findNotebookInstructionsLabel(): Element | null {
  return document.querySelector(`${NOTEBOOK_DIALOG} .dialog-body > .setting-text`);
}

function getNotebookName(): string {
  return document.querySelector('h1.gds-display-s')?.textContent?.trim() ?? '';
}

// ─── Feature ─────────────────────────────────────────────────────────────────

export const InstructionPromptFeature: React.FC = () => {
  const slashEnabled = usePegasusStore((s) => s.enhancedFeatures.gemini.slashCommand);

  const gemTarget = useMemo(() => createQuillTarget(getGemInstructionEditor, getGemName), []);
  const notebookTarget = useMemo(() => createTextareaTarget(getNotebookTextarea, getNotebookName), []);

  return (
    <>
      <InjectedHost
        find={findGemInstructionsHeader}
        place={(anchor, host) => anchor.appendChild(host)}
        hostStyle="margin-left:auto;display:flex;align-items:center;"
      >
        <InstructionToolbar target={gemTarget} />
      </InjectedHost>

      <InjectedHost
        find={findNotebookInstructionsLabel}
        place={(anchor, host) => {
          // Pin to the right of the label block; the description line leaves room
          (anchor as HTMLElement).style.position = 'relative';
          anchor.appendChild(host);
        }}
        hostStyle="position:absolute;right:0;bottom:-4px;"
      >
        <InstructionToolbar target={notebookTarget} compact />
      </InjectedHost>

      <QuillInstructionSlash getEditor={getGemInstructionEditor} enabled={slashEnabled} />
      <TextareaInstructionSlash getTextarea={getNotebookTextarea} enabled={slashEnabled} />
    </>
  );
};
