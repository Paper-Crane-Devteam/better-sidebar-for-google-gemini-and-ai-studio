import React, { useState, useEffect, useRef } from 'react';
import { Folder as FolderIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { snippetDragBus } from '../snippet-drag-bus';
import type { SnippetFolder } from '@/shared/types/db';
import { useShallow } from 'zustand/react/shallow';

/** Below this the sidebar is treated as collapsed. */
const MIN_DRAWER_WIDTH = 200;
const COLLAPSED_FALLBACK_WIDTH = 300;

interface FolderNodeProps {
  folder: SnippetFolder;
  children: SnippetFolder[];
  allFolders: SnippetFolder[];
  depth: number;
}

const FolderNode = ({ folder, children, allFolders, depth }: FolderNodeProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 rounded-sm cursor-default transition-colors',
          isHovered && 'bg-primary/15 ring-1 ring-primary/40',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onPointerEnter={() => {
          setIsHovered(true);
          snippetDragBus.setDropTarget(folder.id);
        }}
        onPointerLeave={() => {
          setIsHovered(false);
          if (snippetDragBus.currentDropTarget === folder.id) {
            snippetDragBus.clearDropTarget();
          }
        }}
      >
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
        <FolderIcon className="w-4 h-4 text-foreground/80" />
        <span className="text-sm truncate">{folder.name}</span>
      </div>
      {children.map((child) => (
        <FolderNode
          key={child.id}
          folder={child}
          children={allFolders.filter((f) => f.parent_id === child.id)}
          allFolders={allFolders}
          depth={depth + 1}
        />
      ))}
    </div>
  );
};

/**
 * Floating drawer that appears during snippet drag.
 * Overlays the sidebar area, showing only the folder tree for drop targets.
 * Hides the real sidebar while active to avoid visual conflict.
 */
export const SnippetDragDrawer = () => {
  const { t } = useI18n();
  const {
    snippetFolders,
  } = useAppStore(
    useShallow((s) => ({
      snippetFolders: s.snippetFolders,
    })),
  );
  const [isActive, setIsActive] = useState(snippetDragBus.isDragging);
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unsubStart = snippetDragBus.on('drag:start', () => setIsActive(true));
    const unsubEnd = snippetDragBus.on('drag:end', () => setIsActive(false));
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, []);

  // Hide/show sidebar when drawer is active
  useEffect(() => {
    const sidebar = (document.querySelector('bard-sidenav') ||
      document.getElementById('better-sidebar-for-google-ai-studio-sidebar-wrapper')) as HTMLElement | null;
    sidebarRef.current = sidebar;

    if (isActive && sidebar) {
      sidebar.style.visibility = 'hidden';
    }
    return () => {
      if (sidebar) {
        sidebar.style.visibility = '';
      }
    };
  }, [isActive]);

  if (!isActive) return null;

  const rootFolders = snippetFolders.filter((f) => !f.parent_id);

  // Determine drawer position based on the sidebar element (Gemini or AI Studio)
  const sidebar = sidebarRef.current;
  let openWidth = '360px';
  let left = 0;

  if (sidebar) {
    if (sidebar.tagName === 'BARD-SIDENAV') {
      // Gemini: use CSS variable for open width
      openWidth =
        getComputedStyle(sidebar).getPropertyValue('--bard-sidenav-open-width').trim() || '360px';
      left = sidebar.getBoundingClientRect().left;
    } else {
      // AI Studio: use the wrapper's actual width. When the sidebar is
      // collapsed the wrapper is 0px wide, which would make the drawer
      // invisible — fall back to a fixed width pinned to the left edge.
      const rect = sidebar.getBoundingClientRect();
      if (rect.width >= MIN_DRAWER_WIDTH) {
        openWidth = `${rect.width}px`;
        left = rect.left;
      } else {
        openWidth = `${COLLAPSED_FALLBACK_WIDTH}px`;
        left = 0;
      }
    }
  }

  return (
    <div
      className="fixed z-[9999] bg-popover rounded-lg shadow-[shadow:var(--shadow-panel)] overflow-hidden flex flex-col"
      style={{
        left: `${left}px`,
        width: openWidth,
        top: '50%',
        transform: 'translateY(-50%)',
        maxHeight: '60vh',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-muted/40">
        <h3 className="text-sm font-medium text-foreground">
          {t('snippets.selectFolder')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('snippets.dragToFolder')}
        </p>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2 px-1">
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            children={snippetFolders.filter((f) => f.parent_id === folder.id)}
            allFolders={snippetFolders}
            depth={0}
          />
        ))}
        {rootFolders.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('snippets.noFolders') || 'No folders'}
          </p>
        )}
      </div>
    </div>
  );
};
