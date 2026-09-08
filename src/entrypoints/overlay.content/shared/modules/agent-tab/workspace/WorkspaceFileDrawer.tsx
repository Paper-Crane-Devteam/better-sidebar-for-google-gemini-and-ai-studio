/**
 * WorkspaceFileDrawer — read a workspace file, to the right of the sidebar.
 *
 * Mounted at the platform's top level (next to `SnippetReaderDrawer`), not inside the
 * Agent tab. A panel nested in the tab is clipped by it, so it could only ever cover the
 * file tree it was opened from; the reading area has to start where the sidebar ends.
 * `fixed inset-0` plus `left: <sidebar width>` is how the snippet reader does it, and the
 * width is measured rather than assumed because the sidebar is resizable.
 *
 * Markdown is rendered; everything else goes through `CodePreview`, which is monospace text
 * plus syntax colouring when the extension names a language we have a grammar for. An
 * unrecognised file still previews, just uncoloured, so nothing about the reader depends on
 * that list being complete. See `shared/lib/syntax-highlight.ts` for what the highlighter
 * costs and why it is a static import.
 */

import React, { useEffect, useState } from 'react';
import { Copy, Download, File as FileIcon, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils/utils';
import { forWorkspace } from '@/shared/workspace/client';
import {
  MARKDOWN_EXTENSIONS,
  PREVIEW_BYTE_LIMIT,
  extensionOf,
  formatBytes,
  isDocumentFormat,
  isProbablyBinary,
} from '@/shared/workspace/file-kinds';
import { useFileViewerStore } from '../../agent-loop/workspace/file-viewer-store';
import { CodePreview } from './CodePreview';
import { downloadFile } from './workspace-io';
import { useWorkspaceRevision } from './useWorkspaceRevision';

/**
 * Why a file is shown as a summary instead of its contents.
 *
 * - `binary` — decoding it as text produces replacement characters, so the "preview" would
 *   be a screenful of noise that looks like corruption. The file is intact; it just is not
 *   text.
 * - `large` — it would render, slowly, and freeze the sidebar while it did. See
 *   `PREVIEW_BYTE_LIMIT`.
 * - `document` — a Word file and friends. Also binary, but the message has to be the
 *   opposite one: the agent *can* read this, so telling the user it cannot is wrong in the
 *   direction that loses them the feature. Rendering it here is a separate job (see
 *   `.kiro/docs/document-formats.md` §10, P4).
 */
type SkipReason = 'binary' | 'large' | 'document';

export const WorkspaceFileDrawer: React.FC = () => {
  const { t } = useI18n();
  const open = useFileViewerStore((s) => s.open);
  const close = useFileViewerStore((s) => s.close);

  const [content, setContent] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ reason: SkipReason; size: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const path = open?.path ?? null;
  const workspaceId = open?.workspaceId ?? null;

  // Fade in on the frame after mount, so the transition has two states to move between.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  /**
   * Clearing is its own effect, keyed on the file rather than on the read below.
   *
   * The read runs again when the agent edits a file (see `revision`), and it must not
   * blank the pane to do it: the reader is a fine place to watch a file being written, and
   * flashing a spinner over prose the user is mid-sentence in is worse than the second of
   * staleness it replaces. Opening a *different* file does have to clear — the previous
   * body under the new name is a lie — and that is exactly what this effect covers.
   *
   * Declared before the read so it lands first when both run.
   */
  useEffect(() => {
    setContent(null);
    setSkipped(null);
    setError(null);
  }, [workspaceId, path]);

  const revision = useWorkspaceRevision();

  useEffect(() => {
    if (!workspaceId || !path) return;

    let cancelled = false;

    const ws = forWorkspace(workspaceId);

    /**
     * Decide before reading, not after.
     *
     * Both reasons to refuse a preview are answerable from the name and the size, so `stat`
     * settles it for one cheap call. Reading first and then deciding would mean paying
     * exactly the cost the refusal exists to avoid — pulling megabytes across the message
     * bridge, or decoding a binary into a string, only to throw it away.
     */
    void (async () => {
      try {
        const info = await ws.stat(path);
        if (cancelled) return;

        const size = info?.size ?? 0;

        // Checked before the generic binary test, which would otherwise claim the file
        // is unreadable — the one thing that is no longer true about it.
        if (isDocumentFormat(path)) {
          setSkipped({ reason: 'document', size });
          setContent(null);
          return;
        }
        if (isProbablyBinary(path)) {
          setSkipped({ reason: 'binary', size });
          return;
        }
        if (size > PREVIEW_BYTE_LIMIT) {
          setSkipped({ reason: 'large', size });
          return;
        }

        const result = await ws.read(path);
        // The drawer can be closed, or switched to another file, while this is in
        // flight; writing then would show one file's body under another's name.
        if (!cancelled) setContent(result.content);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, path, revision]);

  /**
   * Where the sidebar ends — the drawer's left edge.
   *
   * Measured from the live element and observed for resizes, because the sidebar can be
   * dragged wider. A hardcoded width would leave the drawer either overlapping it or
   * floating away from it after any resize.
   */
  const [sidebarWidth, setSidebarWidth] = useState(360);
  useEffect(() => {
    if (!open) return;
    const sidebarEl = (document.querySelector('bard-sidenav') ||
      document.getElementById(
        'better-sidebar-for-google-ai-studio-sidebar-wrapper',
      )) as HTMLElement | null;
    if (!sidebarEl) return;

    setSidebarWidth(sidebarEl.getBoundingClientRect().width);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const last = entries[entries.length - 1];
        if (last) setSidebarWidth(last.contentRect.width);
      }, 150);
    });
    observer.observe(sidebarEl);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !path) return null;

  const name = path.slice(path.lastIndexOf('/') + 1);
  const isMarkdown = MARKDOWN_EXTENSIONS.has(extensionOf(path));
  /** Still deciding. Distinct from "decided not to render", which is `skipped`. */
  const isLoading = content == null && skipped == null && error == null;

  const handleCopy = async () => {
    if (content == null) return;
    await navigator.clipboard.writeText(content);
    toast.success(t('common.copied', { defaultValue: 'Copied' }));
  };

  /**
   * Save the file to disk.
   *
   * Re-reads the file as bytes instead of saving the string on screen. The drawer's copy
   * came through a UTF-8 decode, so anything the decoder could not represent is already
   * a replacement character in it — writing that out produces a file that differs from
   * the one stored. `downloadFile` goes back to the source bytes.
   */
  const handleDownload = async () => {
    if (!workspaceId || !path) return;
    try {
      await downloadFile(workspaceId, path);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9998] flex transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ left: `${sidebarWidth}px` }}
    >
      {/* Backdrop — clicking the page outside the reader closes it */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={close}
      />

      <div
        className={cn(
          'relative flex h-full w-full flex-col transition-transform duration-300 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-[20px]',
        )}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-2 bg-background/80 px-6 py-4 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-foreground">{name}</h2>
            {/* The full path only earns its line when it says something the name doesn't */}
            {path !== name && (
              <p className="truncate text-xs text-muted-foreground">{path}</p>
            )}
          </div>

          <SimpleTooltip content={t('common.copy', { defaultValue: 'Copy' })}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={content == null}
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('common.download', { defaultValue: 'Download' })}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              // Available for a skipped file too — for a binary or an oversized one it is
              // the only thing left to do here, and the reason the drawer opens at all.
              disabled={isLoading || error != null}
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('common.close', { defaultValue: 'Close' })}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-10">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : skipped ? (
            /*
              Centred summary instead of a preview.

              Deliberately not a partial render — no first-N-lines of a binary, no truncated
              head of a large file. A fragment of noise still reads as a broken file, and a
              truncated document invites scrolling for the rest. Saying plainly what the file
              is, and offering the one action that makes sense, is less work to understand
              than either.
            */
            <div className="flex h-full flex-col items-center justify-center gap-3 pb-16 text-center">
              {skipped.reason === 'binary' ? (
                <FileIcon className="h-10 w-10 text-muted-foreground/50" />
              ) : (
                // A document and an oversized text file share the icon on purpose: both
                // are readable content, just not here.
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              )}

              <div className="max-w-md px-6">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {skipped.size > 0 && formatBytes(skipped.size)}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {skipped.reason === 'document'
                    ? t('agent.workspace.documentNoPreview', {
                        defaultValue:
                          'Office documents are not shown here yet, but the agent can read this one — ask it to summarise the file, look at a section, or work through a sheet.',
                      })
                    : skipped.reason === 'binary'
                      ? t('agent.workspace.binaryNoPreview', {
                          defaultValue:
                            'This is a binary file. It is stored exactly as it came in, but it cannot be shown as text and the agent cannot read it.',
                        })
                      : t('agent.workspace.largeNoPreview', {
                          defaultValue:
                            'This file is too large to preview without freezing the sidebar. Download it to read it, or ask the agent — it reads files in slices.',
                        })}
                </p>
              </div>

              <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" />
                {t('common.download', { defaultValue: 'Download' })}
              </Button>
            </div>
          ) : content == null ? (
            // Unreachable: `isLoading` already covers a null body. Spelled out so the
            // branches below can rely on a string without a non-null assertion.
            null
          ) : content === '' ? (
            <p className="text-sm text-muted-foreground">
              {t('agent.workspace.emptyFile', { defaultValue: 'This file is empty.' })}
            </p>
          ) : isMarkdown ? (
            // Constrained so long prose does not run the full width of a wide window.
            <div className="max-w-3xl">
              <MarkdownRenderer>{content}</MarkdownRenderer>
            </div>
          ) : (
            <CodePreview code={content} path={path} />
          )}
        </div>
      </div>
    </div>
  );
};
