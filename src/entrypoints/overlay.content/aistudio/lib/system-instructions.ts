/**
 * AI Studio "System instructions" panel helpers.
 *
 * AI Studio keeps a saved list of system instructions in page localStorage
 * (`aistudio_all_system_instructions`, `[{ title, text }]`) and autosaves the
 * selected entry when its textarea blurs. Titles are not unique.
 *
 * When the panel is in "library" mode we never write into the user's own
 * entries. Everything goes into one dedicated entry titled `SLOT_TITLE`
 * (created on first use, recreated if deleted), driven through the panel's
 * own DOM so AI Studio's in-memory state stays authoritative.
 */
import i18n from '@/locale/i18n';
import { useAppStore } from '@/shared/lib/store';
import { setNativeValue } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/targets';
import type { InstructionTarget } from '@/entrypoints/overlay.content/shared/modules/prompts/instruction-fill/targets';

export const AISTUDIO_SYSTEM_KEY = 'aistudio_all_system_instructions';

/** Title of our dedicated entry in AI Studio's list. Not translated: it's an identifier. */
export const SLOT_TITLE = '⚡ Better Sidebar';

export const PANEL_SELECTOR = 'ms-system-instructions';
export const LIBRARY_MODE_CLASS = 'bs-library-mode';
const SILENT_SELECT_CLASS = 'bs-silent-select';
const STYLE_ID = 'bs-system-instructions-style';

interface AiStudioSystemItem {
  title?: string;
  text?: string;
}

// ─── Page styles ─────────────────────────────────────────────────────────────

/**
 * - library mode: hide AI Studio's own picker + title row (we manage the entry)
 * - silent select: keep the select overlay invisible while we drive it
 */
export function ensurePanelStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${PANEL_SELECTOR}.${LIBRARY_MODE_CLASS} > .select-tooltip-wrapper,
${PANEL_SELECTOR}.${LIBRARY_MODE_CLASS} > .title-row { display: none !important; }
html.${SILENT_SELECT_CLASS} .cdk-overlay-pane:has(.mat-mdc-select-panel) { opacity: 0 !important; }
`;
  document.head.appendChild(style);
}

// ─── DOM access ──────────────────────────────────────────────────────────────

export function getPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PANEL_SELECTOR);
}

export function getPanelTextarea(): HTMLTextAreaElement | null {
  return getPanel()?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
}

function getTitleInput(): HTMLInputElement | null {
  return getPanel()?.querySelector<HTMLInputElement>('.title-row input') ?? null;
}

function getSelectedTitle(): string {
  return getPanel()?.querySelector('.mat-mdc-select-value-text')?.textContent?.trim() ?? '';
}

/**
 * Our entry is the one being edited. The title input is checked too: a freshly
 * created entry carries our title there before AI Studio has saved it and the
 * picker label catches up.
 */
export function isSlotSelected(): boolean {
  return getSelectedTitle() === SLOT_TITLE || getTitleInput()?.value === SLOT_TITLE;
}

function waitFor<T>(fn: () => T | null | undefined | false, timeout = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(tick, 30);
    };
    tick();
  });
}

// ─── Slot entry ──────────────────────────────────────────────────────────────

let pendingSlot: Promise<boolean> | null = null;

/**
 * Make our entry the selected one, creating it ("+ Create new instruction",
 * then name it) when it doesn't exist yet. The textarea then shows the
 * slot's content — callers restore/write what they want afterwards.
 */
export function ensureSlotSelected(): Promise<boolean> {
  if (isSlotSelected()) return Promise.resolve(true);
  if (pendingSlot) return pendingSlot;

  pendingSlot = (async () => {
    const panel = getPanel();
    const trigger = panel?.querySelector<HTMLElement>('.mat-mdc-select-trigger');
    if (!trigger) return false;

    ensurePanelStyles();
    document.documentElement.classList.add(SILENT_SELECT_CLASS);
    try {
      trigger.click();
      const options = await waitFor(() => {
        const list = document.querySelectorAll<HTMLElement>('.mat-mdc-select-panel mat-option');
        return list.length > 0 ? Array.from(list) : null;
      });
      if (!options) return false;

      const slot = options.find(
        (o) => (o.querySelector('.mdc-list-item__primary-text')?.textContent ?? o.textContent ?? '').trim() === SLOT_TITLE,
      );

      if (slot) {
        slot.click();
        const ok = !!(await waitFor(() => getSelectedTitle() === SLOT_TITLE));
        // Let Angular push the entry's text into the textarea before callers overwrite it
        await new Promise((r) => setTimeout(r, 60));
        return ok;
      }

      // First option is "+ Create new instruction"
      options[0].click();
      const titleInput = await waitFor(() => {
        const input = getTitleInput();
        return input && input.value === '' ? input : null;
      });
      if (!titleInput) return false;
      setNativeValue(titleInput, SLOT_TITLE);
      await new Promise((r) => setTimeout(r, 60));
      return true;
    } finally {
      // Let the overlay finish its close animation before un-hiding
      setTimeout(() => document.documentElement.classList.remove(SILENT_SELECT_CLASS), 300);
    }
  })().finally(() => {
    pendingSlot = null;
  });

  return pendingSlot;
}

/** Write text into the slot entry and let AI Studio autosave it (on blur) */
export async function writeToSlot(text: string): Promise<void> {
  const ok = await ensureSlotSelected();
  if (!ok) throw new Error('Could not select the Better Sidebar entry');
  const textarea = await waitFor(() => getPanelTextarea());
  if (!textarea) throw new Error('System instructions textarea not found');
  textarea.focus();
  setNativeValue(textarea, text);
  textarea.blur();
}

/**
 * Move whatever is in the textarea into the slot entry, unchanged. Used when
 * the user starts editing in library mode, so their typing never lands in one
 * of AI Studio's own saved entries (the picker that would show which one is
 * hidden in this mode).
 */
export async function forkIntoSlot(): Promise<void> {
  if (isSlotSelected()) return;
  const textarea = getPanelTextarea();
  if (!textarea) return;
  const current = textarea.value;
  const caret = textarea.selectionStart;
  const ok = await ensureSlotSelected();
  if (!ok) return;
  const next = await waitFor(() => getPanelTextarea());
  if (!next) return;
  setNativeValue(next, current);
  next.focus();
  next.selectionStart = next.selectionEnd = Math.min(caret, current.length);
}

export function createAiStudioTarget(): InstructionTarget {
  return {
    getText: () => getPanelTextarea()?.value ?? '',
    setText: (text) => writeToSlot(text),
    getTitle: () => {
      const title = getSelectedTitle();
      return title && title !== SLOT_TITLE ? title : '';
    },
  };
}

// ─── Import into the prompt library ──────────────────────────────────────────

export type ImportResult =
  | { status: 'ok'; count: number; folderName: string }
  | { status: 'nodata' }
  | { status: 'invalid' }
  | { status: 'failed' };

async function readNativeInstructions(): Promise<string | null> {
  try {
    const res = await browser.runtime.sendMessage({
      type: 'GET_PAGE_LOCAL_STORAGE',
      payload: { key: AISTUDIO_SYSTEM_KEY },
    });
    if (res?.success) return res.data ?? null;
  } catch {
    // fall through to direct read — content scripts share the page's localStorage
  }
  return localStorage.getItem(AISTUDIO_SYSTEM_KEY);
}

/**
 * Copy AI Studio's saved instructions into the prompt library
 * ("AI Studio System" folder). Skips our slot entry and anything whose
 * content is already in the library, so it's safe to run more than once.
 */
export async function importNativeInstructions(): Promise<ImportResult> {
  try {
    const raw = await readNativeInstructions();
    if (raw == null || raw === '') return { status: 'nodata' };

    let items: AiStudioSystemItem[];
    try {
      items = JSON.parse(raw);
    } catch {
      return { status: 'invalid' };
    }
    if (!Array.isArray(items)) return { status: 'invalid' };

    const store = useAppStore.getState();
    const existing = new Set(store.prompts.map((p) => (p.content || '').trim()));
    const fresh: Array<{ title: string; content: string }> = [];
    for (const item of items) {
      if ((item.title ?? '').trim() === SLOT_TITLE) continue;
      const content = (item.text ?? item.title ?? '').trim();
      if (!content || existing.has(content)) continue;
      existing.add(content);
      const title = ((item.title ?? '').trim() || content.split('\n')[0]).slice(0, 100) || i18n.t('prompts.untitledSystem');
      fresh.push({ title, content });
    }
    if (fresh.length === 0) return { status: 'nodata' };

    const folderName = i18n.t('prompts.aiStudioSystemFolderName');
    let folderId: string | null = store.promptFolders.find((f) => f.name === folderName)?.id ?? null;
    if (folderId == null) folderId = await store.createPromptFolder(folderName, null);
    if (folderId == null) return { status: 'failed' };

    for (const item of fresh) {
      await useAppStore.getState().createPrompt(item.title, item.content, 'system', 'Bot', folderId);
    }
    return { status: 'ok', count: fresh.length, folderName };
  } catch (err) {
    console.error('[AIStudio] Import system instructions failed:', err);
    return { status: 'failed' };
  }
}
