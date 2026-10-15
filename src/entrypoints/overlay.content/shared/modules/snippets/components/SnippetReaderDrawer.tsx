import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { X, Copy, Pencil, ExternalLink, ChevronUp, ChevronDown, Download } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { CreateSnippetForm } from './CreateSnippetForm';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils/utils';
import { useExport } from '../../../features/export';
import { openExportDialog } from '../../../features/export/ExportFormatDialog';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import type { Snippet } from '@/shared/types/db';
import type { ExportFormat } from '../../../features/export/types';
import { useShallow } from 'zustand/react/shallow';

interface SnippetCardProps {
  snippet: Snippet;
  isActive: boolean;
  onSelect: (snippet: Snippet) => void;
  onCopy: (snippet: Snippet) => void;
  onEdit: (snippet: Snippet) => void;
  onNavigate: (snippet: Snippet) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}

const SnippetCard = ({ snippet, isActive, onSelect, onCopy, onEdit, onNavigate, cardRef }: SnippetCardProps) => {
  const { t } = useI18n();

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <div
      ref={cardRef}
      data-snippet-id={snippet.id}
      className={cn(
        'rounded-lg p-5 transition-all cursor-pointer',
        isActive
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'bg-muted/40 hover:bg-muted/60',
      )}
      onClick={() => onSelect(snippet)}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-foreground leading-tight break-words min-w-0 flex-1">
          {snippet.title}
        </h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          {formatDate(snippet.created_at)}
        </span>
      </div>

      {/* Markdown Content */}
      {snippet.content && (
        <div className="mb-4">
          <MarkdownRenderer>{snippet.content}</MarkdownRenderer>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-2 text-muted-foreground hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); onSelect(snippet); onCopy(snippet); }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t('common.copy')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-2 text-muted-foreground hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); onSelect(snippet); onEdit(snippet); }}
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('common.edit')}
        </Button>
        {snippet.source_url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-2 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onSelect(snippet); onNavigate(snippet); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('snippets.goToSource')}
          </Button>
        )}
      </div>
    </div>
  );
};

export const SnippetReaderDrawer = () => {
  const { t } = useI18n();
  const {
    snippets,
    snippetFolders,
    favorites,
    ui,
    closeSnippetReaderDrawer,
    updateSnippet,
  } = useAppStore(
    useShallow((s) => ({
      snippets: s.snippets,
      snippetFolders: s.snippetFolders,
      favorites: s.favorites,
      ui: s.ui,
      closeSnippetReaderDrawer: s.closeSnippetReaderDrawer,
      updateSnippet: s.updateSnippet,
    })),
  );

  const { isOpen, folderId, activeSnippetId } = ui.snippets.readerDrawer;
  const { sortOrder } = ui.snippets;
  const activeTab = ui.overlay.activeTab;
  const shouldShow = isOpen && activeTab === 'snippets';
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasScrolledRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);
  const { exportItems } = useExport();

  // Build favorite IDs set
  const favoriteIds = useMemo(() => {
    return new Set(
      favorites
        .filter((f) => f.target_type === 'snippet')
        .map((f) => f.target_id),
    );
  }, [favorites]);

  // Get the folder snippets sorted the same way as SnippetsTree
  const folderSnippets = useMemo(() => {
    if (!isOpen) return [];
    const filtered = snippets.filter((s) => s.folder_id === folderId);

    return filtered.sort((a, b) => {
      // Pinned items always come first
      const isAPinned = a.is_pinned ? 1 : 0;
      const isBPinned = b.is_pinned ? 1 : 0;
      if (isAPinned !== isBPinned) return isBPinned - isAPinned;

      // Favorited files come next
      const isAFav = favoriteIds.has(a.id);
      const isBFav = favoriteIds.has(b.id);
      if (isAFav && !isBFav) return -1;
      if (!isAFav && isBFav) return 1;

      // Sort by selected order
      if (sortOrder === 'date') {
        const dateA = a.updated_at || a.created_at || 0;
        const dateB = b.updated_at || b.created_at || 0;
        return dateB - dateA;
      }
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [snippets, folderId, isOpen, sortOrder, favoriteIds]);

  // Get folder name
  const folderName = useMemo(() => {
    if (!folderId) return t('snippets.allSnippets');
    const folder = snippetFolders.find((f) => f.id === folderId);
    return folder?.name || t('snippets.allSnippets');
  }, [folderId, snippetFolders, t]);

  // Handle open/close animation
  useEffect(() => {
    if (shouldShow) {
      hasScrolledRef.current = false;
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [shouldShow]);

  // Scroll to active snippet using refs (Shadow DOM safe)
  const scrollToSnippet = useCallback((snippetId: string, behavior: ScrollBehavior = 'instant') => {
    const el = cardRefsMap.current.get(snippetId);
    const container = scrollContainerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const scrollTop = container.scrollTop + (elRect.top - containerRect.top) - 16;
      container.scrollTo({ top: scrollTop, behavior });
    }
  }, []);

  // Initial scroll to active snippet
  useEffect(() => {
    if (shouldShow && isVisible && activeSnippetId && !hasScrolledRef.current) {
      const timer = setTimeout(() => {
        scrollToSnippet(activeSnippetId, 'instant');
        hasScrolledRef.current = true;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [shouldShow, isVisible, activeSnippetId, scrollToSnippet]);

  // Scroll to snippet when activeSnippetId changes while drawer is already open
  const prevActiveSnippetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (shouldShow && isVisible && activeSnippetId && hasScrolledRef.current) {
      if (prevActiveSnippetIdRef.current && prevActiveSnippetIdRef.current !== activeSnippetId) {
        setTimeout(() => scrollToSnippet(activeSnippetId, 'smooth'), 50);
      }
    }
    prevActiveSnippetIdRef.current = activeSnippetId;
  }, [shouldShow, isVisible, activeSnippetId, scrollToSnippet]);

  // ESC key to close
  useEffect(() => {
    if (!shouldShow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSnippetReaderDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldShow, closeSnippetReaderDrawer]);

  const handleCopy = useCallback((snippet: Snippet) => {
    if (snippet.content) {
      navigator.clipboard.writeText(snippet.content);
      toast.success(t('snippets.copiedToClipboard'), 1000);
    }
  }, [t]);

  const handleEdit = useCallback((snippet: Snippet) => {
    let editFormData = {
      title: snippet.title ?? '',
      content: snippet.content ?? '',
    };

    const doUpdate = () => {
      if (!editFormData.title.trim()) return;
      updateSnippet(snippet.id, editFormData);
      useModalStore.getState().close();
    };

    useModalStore.getState().open({
      type: 'confirm',
      title: t('snippets.editSnippet'),
      content: (
        <CreateSnippetForm
          formRef={editFormRef}
          initialValues={editFormData}
          onChange={(d) => (editFormData = d)}
          onValidSubmit={doUpdate}
        />
      ),
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
      onConfirm: doUpdate,
      onCancel: () => useModalStore.getState().close(),
      modalClassName: 'max-w-2xl',
    });
  }, [t, updateSnippet]);

  const handleNavigate = useCallback((snippet: Snippet) => {
    if (snippet.source_url) {
      window.open(snippet.source_url, '_blank');
    }
  }, []);

  const handleFolderExport = useCallback((format: ExportFormat) => {
    const items = folderSnippets.map((s) => ({
      id: s.id,
      title: s.title || t('common.untitled'),
      content: s.content || '',
      sourceUrl: s.source_url,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
    exportItems(items, format, { batchName: folderName });
  }, [folderSnippets, exportItems, t, folderName]);

  const handleSelect = useCallback((snippet: Snippet) => {
    useAppStore.getState().openSnippetReaderDrawer(folderId, snippet.id);
  }, [folderId]);

  // Navigate between snippets
  const currentIndex = useMemo(() => {
    return folderSnippets.findIndex((s) => s.id === activeSnippetId);
  }, [folderSnippets, activeSnippetId]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevSnippet = folderSnippets[currentIndex - 1];
      useAppStore.getState().openSnippetReaderDrawer(folderId, prevSnippet.id);
      setTimeout(() => scrollToSnippet(prevSnippet.id, 'smooth'), 50);
    }
  }, [currentIndex, folderSnippets, folderId, scrollToSnippet]);

  const handleNext = useCallback(() => {
    if (currentIndex < folderSnippets.length - 1) {
      const nextSnippet = folderSnippets[currentIndex + 1];
      useAppStore.getState().openSnippetReaderDrawer(folderId, nextSnippet.id);
      setTimeout(() => scrollToSnippet(nextSnippet.id, 'smooth'), 50);
    }
  }, [currentIndex, folderSnippets, folderId, scrollToSnippet]);

  // Register card ref
  const getCardRef = useCallback((snippetId: string) => {
    return (el: HTMLDivElement | null) => {
      if (el) {
        cardRefsMap.current.set(snippetId, el);
      } else {
        cardRefsMap.current.delete(snippetId);
      }
    };
  }, []);

  // Compute the sidebar width from the actual sidebar element (Gemini or AI Studio)
  const [sidebarWidth, setSidebarWidth] = useState(360);
  useEffect(() => {
    if (!shouldShow) return;
    const sidebarEl = (document.querySelector('bard-sidenav') ||
      document.getElementById('better-sidebar-for-google-ai-studio-sidebar-wrapper')) as HTMLElement | null;
    if (sidebarEl) {
      const rect = sidebarEl.getBoundingClientRect();
      setSidebarWidth(rect.width);

      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const resizeObserver = new ResizeObserver((entries) => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) setSidebarWidth(lastEntry.contentRect.width);
        }, 150);
      });
      resizeObserver.observe(sidebarEl);
      return () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeObserver.disconnect();
      };
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9998] flex transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      style={{
        left: `${sidebarWidth}px`,
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={closeSnippetReaderDrawer}
      />

      {/* Drawer Content */}
      <div
        className={cn(
          'relative w-full h-full flex flex-col transition-transform duration-300 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-[20px]',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {folderName}
            </h2>
            <span className="text-sm text-muted-foreground">
              {folderSnippets.length} {t('snippets.items')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <SimpleTooltip content={t('export.exportFolder')}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={folderSnippets.length === 0}
                onClick={() => openExportDialog(handleFolderExport)}
              >
                <Download className="h-4 w-4" />
              </Button>
            </SimpleTooltip>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={closeSnippetReaderDrawer}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {folderSnippets.map((snippet) => (
              <SnippetCard
                key={snippet.id}
                snippet={snippet}
                isActive={snippet.id === activeSnippetId}
                onSelect={handleSelect}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onNavigate={handleNavigate}
                cardRef={getCardRef(snippet.id)}
              />
            ))}

            {folderSnippets.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                {t('snippets.noSnippets')}
              </div>
            )}
          </div>
        </div>

        {/* Floating navigation buttons - bottom right */}
        {folderSnippets.length > 1 && (
          <div className="absolute bottom-10 right-10 flex flex-col gap-3 z-10">
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0 rounded-full shadow-md bg-background/90 backdrop-blur-sm"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-11 p-0 rounded-full shadow-md bg-background/90 backdrop-blur-sm"
              onClick={handleNext}
              disabled={currentIndex >= folderSnippets.length - 1}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
