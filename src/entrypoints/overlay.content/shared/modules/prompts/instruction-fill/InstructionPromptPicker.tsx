import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShadowRoot } from '@/shared/components/ShadowRootContext';
import { ArrowLeft, ChevronRight, Folder, FolderOpen, Search } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { Button } from '@/shared/components/ui/button';
import type { Prompt, PromptFolder } from '@/shared/types/db';
import { PromptIconDisplay } from '../lib/prompt-icons';
import { VariableFillForm, type VariableFillFormRef } from '../components/VariableFillForm';
import { resolvePromptContent, applyVariables } from '../../slash-command/resolvePrompt';
import type { PromptVariable } from '@/shared/lib/prompt-variables';

export interface InstructionPickResult {
  prompt: Prompt;
  /** Final text to write: imports resolved, variables substituted */
  content: string;
}

type TypeFilter = 'system' | 'all';

type Row =
  | { kind: 'folder'; folder: PromptFolder; depth: number; expanded: boolean }
  | { kind: 'prompt'; prompt: Prompt; depth: number; path?: string };

const ROW_HEIGHT = 32;
const MAX_ROWS = 9;
const PREVIEW_WIDTH = 340;
const PREVIEW_MIN_WIDTH = 220;
const PREVIEW_GAP = 8;

type SidePlacement = { left: number; top: number; width: number; height: number };

/** Right of the dropdown if it fits, else left, else the roomier side (if wide enough) */
function placeBeside(rect: DOMRect): SidePlacement | null {
  const spaceRight = window.innerWidth - rect.right - PREVIEW_GAP - 8;
  const spaceLeft = rect.left - PREVIEW_GAP - 8;
  let side: 'left' | 'right';
  let width = PREVIEW_WIDTH;
  if (spaceRight >= PREVIEW_WIDTH) side = 'right';
  else if (spaceLeft >= PREVIEW_WIDTH) side = 'left';
  else {
    side = spaceRight >= spaceLeft ? 'right' : 'left';
    width = Math.max(spaceRight, spaceLeft);
    if (width < PREVIEW_MIN_WIDTH) return null;
  }
  const left = side === 'right' ? rect.right + PREVIEW_GAP : rect.left - PREVIEW_GAP - width;
  return { left, top: rect.top, width, height: rect.height };
}

/**
 * Full content of the highlighted prompt, beside the dropdown and just as tall.
 * Scrollable: the mouse can move over it without changing the highlight.
 * Falls back to a short inline preview when neither side has room.
 */
const PromptPreviewPanel: React.FC<{ prompt: Prompt; anchorRef: React.RefObject<HTMLElement | null> }> = ({
  prompt,
  anchorRef,
}) => {
  const container = useShadowRoot();
  const [place, setPlace] = useState<SidePlacement | null | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popover = anchorRef.current?.closest<HTMLElement>('[data-popover-picker]');
    if (!popover) {
      setPlace(null);
      return;
    }
    const update = () => setPlace(placeBeside(popover.getBoundingClientRect()));
    update();
    // The dropdown animates in and repositions itself; follow it
    const ro = new ResizeObserver(update);
    ro.observe(popover);
    const t1 = setTimeout(update, 60);
    const t2 = setTimeout(update, 200);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [prompt.id]);

  if (place === undefined) return null;

  if (place === null || !container) {
    return (
      <div className="border-t border-border/50 px-3 py-2">
        <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-muted-foreground">{prompt.content}</p>
      </div>
    );
  }

  return createPortal(
    <div
      data-popover-picker-keep=""
      className="fixed z-[10002] flex flex-col rounded-lg bg-popover shadow-[shadow:var(--shadow-popover)] overflow-hidden animate-in fade-in-0 duration-100"
      style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <PromptIconDisplay name={prompt.icon || ''} className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{prompt.title}</span>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 custom-scrollbar">
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
          {prompt.content}
        </p>
      </div>
    </div>,
    container,
  );
};

// Remembered across opens within the page session
const expandedFolders = new Set<string>();
let lastTypeFilter: TypeFilter | null = null;

function byOrder<T extends { order_index: number }>(a: T, b: T) {
  return (a.order_index ?? 0) - (b.order_index ?? 0);
}

/**
 * Dropdown content for picking a prompt to fill into a native instructions box.
 * Search + folder tree in one list; clicking a prompt resolves immediately
 * (variables are filled inline, without stacking another modal).
 *
 * Rendered inside GlobalPopoverPicker; resolves `InstructionPickResult`.
 */
export const InstructionPromptPicker: React.FC = () => {
  const { t } = useI18n();
  const { prompts, promptFolders } = useAppStore(
    useShallow((s) => ({ prompts: s.prompts, promptFolders: s.promptFolders })),
  );
  const resolve = usePopoverPickerStore((s) => s.resolve);
  const closePicker = usePopoverPickerStore((s) => s.close);

  const hasSystem = useMemo(() => prompts.some((p) => p.type === 'system'), [prompts]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    () => lastTypeFilter ?? (hasSystem ? 'system' : 'all'),
  );
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Bumped whenever the module-level `expandedFolders` set changes
  const [expandVersion, setExpandVersion] = useState(0);
  const [variableStep, setVariableStep] = useState<{
    prompt: Prompt;
    content: string;
    variables: PromptVariable[];
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const variableFormRef = useRef<VariableFillFormRef | null>(null);

  useEffect(() => {
    lastTypeFilter = typeFilter;
  }, [typeFilter]);

  useEffect(() => {
    // Wait a frame: the popover renders invisibly first, then positions
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [variableStep]);

  const visiblePrompts = useMemo(
    () => (typeFilter === 'system' ? prompts.filter((p) => p.type === 'system') : prompts),
    [prompts, typeFilter],
  );

  const folderById = useMemo(() => new Map(promptFolders.map((f) => [f.id, f])), [promptFolders]);

  const folderPath = useCallback(
    (folderId: string | null): string => {
      const names: string[] = [];
      let cur = folderId ? folderById.get(folderId) : undefined;
      let guard = 0;
      while (cur && guard++ < 20) {
        names.unshift(cur.name);
        cur = cur.parent_id ? folderById.get(cur.parent_id) : undefined;
      }
      return names.join(' / ');
    },
    [folderById],
  );

  const rows = useMemo<Row[]>(() => {
    const query = search.trim().toLowerCase();

    // ── Search: flat list, title matches before content matches ──
    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      const scored: Array<{ prompt: Prompt; score: number }> = [];
      for (const p of visiblePrompts) {
        const title = p.title.toLowerCase();
        const content = (p.content || '').toLowerCase();
        let score = 0;
        let ok = true;
        for (const w of words) {
          const ti = title.indexOf(w);
          if (ti >= 0) score += ti === 0 ? 100 : 60;
          else if (content.includes(w)) score += 10;
          else {
            ok = false;
            break;
          }
        }
        if (ok) scored.push({ prompt: p, score });
      }
      scored.sort((a, b) => b.score - a.score || a.prompt.title.localeCompare(b.prompt.title));
      return scored.map(({ prompt }) => ({
        kind: 'prompt',
        prompt,
        depth: 0,
        path: folderPath(prompt.folder_id),
      }));
    }

    // ── Tree: only folders that (transitively) hold a visible prompt ──
    const promptsByFolder = new Map<string | null, Prompt[]>();
    for (const p of visiblePrompts) {
      const key = p.folder_id && folderById.has(p.folder_id) ? p.folder_id : null;
      const list = promptsByFolder.get(key) ?? [];
      list.push(p);
      promptsByFolder.set(key, list);
    }
    const childFolders = new Map<string | null, PromptFolder[]>();
    for (const f of promptFolders) {
      const key = f.parent_id && folderById.has(f.parent_id) ? f.parent_id : null;
      const list = childFolders.get(key) ?? [];
      list.push(f);
      childFolders.set(key, list);
    }
    const nonEmpty = new Map<string, boolean>();
    const hasContent = (folderId: string, guard = 0): boolean => {
      if (nonEmpty.has(folderId)) return nonEmpty.get(folderId)!;
      const result =
        (promptsByFolder.get(folderId)?.length ?? 0) > 0 ||
        (guard < 20 && (childFolders.get(folderId) ?? []).some((c) => hasContent(c.id, guard + 1)));
      nonEmpty.set(folderId, result);
      return result;
    };

    const out: Row[] = [];
    const walk = (parentId: string | null, depth: number) => {
      if (depth > 20) return;
      const folders = (childFolders.get(parentId) ?? [])
        .filter((f) => hasContent(f.id))
        .sort((a, b) => (b.is_pinned ?? 0) - (a.is_pinned ?? 0) || byOrder(a, b) || a.name.localeCompare(b.name));
      for (const f of folders) {
        const expanded = expandedFolders.has(f.id);
        out.push({ kind: 'folder', folder: f, depth, expanded });
        if (expanded) walk(f.id, depth + 1);
      }
      const items = [...(promptsByFolder.get(parentId) ?? [])].sort(
        (a, b) => byOrder(a, b) || a.title.localeCompare(b.title),
      );
      for (const p of items) out.push({ kind: 'prompt', prompt: p, depth });
    };
    walk(null, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, visiblePrompts, promptFolders, folderById, folderPath, expandVersion]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search, typeFilter]);

  // Keep the active row in view
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = activeIndex * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  }, [activeIndex]);

  const toggleFolder = useCallback((id: string, open?: boolean) => {
    const next = open ?? !expandedFolders.has(id);
    if (next) expandedFolders.add(id);
    else expandedFolders.delete(id);
    setExpandVersion((n) => n + 1);
  }, []);

  const pickPrompt = useCallback(
    (prompt: Prompt) => {
      const { resolvedContent, variables } = resolvePromptContent(prompt);
      if (variables.length > 0) {
        setVariableStep({ prompt, content: resolvedContent, variables });
        return;
      }
      resolve<InstructionPickResult>({ prompt, content: resolvedContent });
    },
    [resolve],
  );

  const confirmVariables = useCallback(() => {
    if (!variableStep) return;
    const values = variableFormRef.current?.getValues() ?? {};
    resolve<InstructionPickResult>({
      prompt: variableStep.prompt,
      content: applyVariables(variableStep.content, values),
    });
  }, [variableStep, resolve]);

  const activateRow = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      if (row.kind === 'folder') toggleFolder(row.folder.id);
      else pickPrompt(row.prompt);
    },
    [toggleFolder, pickPrompt],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keep keys away from the host page: Escape would also close the native
    // dialog underneath, and Gemini/AI Studio have their own global shortcuts.
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (variableStep) setVariableStep(null);
      else closePicker();
      return;
    }
    if (variableStep) {
      if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'INPUT') {
        e.preventDefault();
        confirmVariables();
      }
      return;
    }

    const row = rows[activeIndex];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'ArrowRight':
        if (row?.kind === 'folder' && !row.expanded) {
          e.preventDefault();
          toggleFolder(row.folder.id, true);
        }
        break;
      case 'ArrowLeft':
        if (row?.kind === 'folder' && row.expanded) {
          e.preventDefault();
          toggleFolder(row.folder.id, false);
        }
        break;
      case 'Enter':
        e.preventDefault();
        activateRow(row);
        break;
    }
  };

  const goToPrompts = () => {
    closePicker();
    const store = useAppStore.getState();
    if (!store.ui.overlay.isOpen) store.setOverlayOpen(true);
    store.setActiveTab('prompts');
  };

  // ── Variable step ──────────────────────────────────────────────
  if (variableStep) {
    return (
      <div className="-mx-6 -my-4 flex flex-col" onKeyDown={handleKeyDown}>
        <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border/50">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setVariableStep(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PromptIconDisplay name={variableStep.prompt.icon || ''} className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{variableStep.prompt.title}</span>
        </div>
        <div className="px-4 py-3 max-h-[360px] overflow-y-auto">
          <VariableFillForm ref={variableFormRef} variables={variableStep.variables} />
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={() => setVariableStep(null)}>
            {t('instructionPrompt.back')}
          </Button>
          <Button size="sm" onClick={confirmVariables}>
            {t('instructionPrompt.fill')}
          </Button>
        </div>
      </div>
    );
  }

  // ── List step ──────────────────────────────────────────────────
  const activeRow = rows[activeIndex];
  const previewPrompt = activeRow?.kind === 'prompt' ? activeRow.prompt : null;

  return (
    <div ref={rootRef} className="-mx-6 -my-4 flex flex-col" onKeyDown={handleKeyDown}>
      {/* Search + type filter */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('instructionPrompt.searchPlaceholder')}
            className="flex h-8 w-full rounded-md border border-border/60 bg-transparent px-3 pl-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex shrink-0 rounded-md bg-muted/50 p-0.5 text-xs">
          {(['system', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                'px-2 h-7 rounded transition-colors',
                typeFilter === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                setTypeFilter(value);
                inputRef.current?.focus();
              }}
            >
              {value === 'system' ? t('instructionPrompt.filterSystem') : t('instructionPrompt.filterAll')}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div
        ref={listRef}
        className="overflow-y-auto px-1.5 pb-1.5 custom-scrollbar"
        style={{ maxHeight: MAX_ROWS * ROW_HEIGHT }}
      >
        {rows.length === 0 ? (
          prompts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
              <span className="text-sm text-muted-foreground">{t('instructionPrompt.emptyLibrary')}</span>
              <Button variant="outline" size="sm" onClick={goToPrompts}>
                {t('instructionPrompt.goToPrompts')}
              </Button>
            </div>
          ) : (
            <div className="px-4 py-5 text-center text-sm text-muted-foreground">
              {t('instructionPrompt.noMatches')}
            </div>
          )
        ) : (
          rows.map((row, index) => {
            const isActive = index === activeIndex;
            const indent = { paddingLeft: 8 + row.depth * 16 };
            if (row.kind === 'folder') {
              return (
                <button
                  key={`f:${row.folder.id}`}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm text-foreground',
                    isActive && 'bg-accent/60',
                  )}
                  style={{ height: ROW_HEIGHT, ...indent }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => toggleFolder(row.folder.id)}
                >
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', row.expanded && 'rotate-90')}
                  />
                  {row.expanded ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{row.folder.name}</span>
                </button>
              );
            }
            return (
              <button
                key={`p:${row.prompt.id}`}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md pr-2 text-left text-sm text-foreground',
                  isActive && 'bg-accent/60',
                )}
                style={{ height: ROW_HEIGHT, ...indent }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pickPrompt(row.prompt)}
              >
                {/* Align with folder names (chevron slot) in tree mode */}
                {!search.trim() && <span className="w-3.5 shrink-0" />}
                <PromptIconDisplay name={row.prompt.icon || ''} className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{row.prompt.title}</span>
                {row.path && (
                  <span className="shrink-0 max-w-[40%] truncate text-xs text-muted-foreground">{row.path}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Preview of the highlighted prompt (beside the dropdown when there's room) */}
      {previewPrompt && <PromptPreviewPanel prompt={previewPrompt} anchorRef={rootRef} />}
    </div>
  );
};
