import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TreeView, PendingNewFolder } from '@/shared/components/ui/tree-view';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils/utils';
import { Folder, FolderPlus, Search, X } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

interface FolderItem {
  id: string;
  name: string;
  parent_id?: string | null;
}

interface FolderPickerProps {
  folders: FolderItem[];
  onSelect: (folderId: string | null) => void;
  selectedIds?: string[]; // IDs to exclude (e.g. prevent moving folder into itself)
  initialSelectedId?: string | null;
  className?: string;
  /** Called to create a new folder. Returns the new folder id or null. */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<string | null>;
}

export const FolderPicker = ({
  folders,
  onSelect,
  selectedIds = [],
  initialSelectedId = null,
  className,
  onCreateFolder,
}: FolderPickerProps) => {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [pendingParentId, setPendingParentId] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const treeData = useMemo(() => {
    const folderMap = new Map<string, any>();
    const rootNodes: any[] = [];

    folders.forEach((f) => {
      if (selectedIds.includes(f.id)) return;
      folderMap.set(f.id, {
        id: f.id,
        name: f.name,
        type: 'folder' as const,
        children: [],
        data: f,
      });
    });

    folders.forEach((f) => {
      const node = folderMap.get(f.id);
      if (!node) return;
      if (f.parent_id && folderMap.has(f.parent_id)) {
        folderMap.get(f.parent_id).children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  }, [folders, selectedIds]);

  // Keep a folder when its own name matches, or when one of its descendants
  // matches. A matching folder keeps its whole subtree so children stay pickable.
  const filteredTreeData = useMemo(() => {
    if (!isSearching) return treeData;
    const term = trimmedQuery.toLowerCase();

    const filterNodes = (nodes: any[]): any[] =>
      nodes.reduce<any[]>((acc, node) => {
        const selfMatches = (node.name || '').toLowerCase().includes(term);
        if (selfMatches) {
          acc.push(node);
          return acc;
        }
        const children = filterNodes(node.children || []);
        if (children.length > 0) {
          acc.push({ ...node, children });
        }
        return acc;
      }, []);

    return filterNodes(treeData);
  }, [treeData, isSearching, trimmedQuery]);

  const handleClearSearch = () => {
    setQuery('');
    searchInputRef.current?.focus();
  };

  const handleSelect = (item: any) => {
    setSelectedId(item.id);
    onSelect(item.id);
  };

  const handleStartCreate = () => {
    // Clear the filter first, otherwise the inline input can land inside a
    // branch that the current query hides.
    setQuery('');
    // Insert pending node under selected folder, or root if nothing selected
    setPendingParentId(selectedId);
  };

  const handleConfirmCreate = useCallback(async (name: string) => {
    if (!onCreateFolder) return;
    const parentId = pendingParentId === undefined ? null : pendingParentId;
    const newId = await onCreateFolder(name, parentId);
    setPendingParentId(undefined);
    if (newId) {
      setSelectedId(newId);
      onSelect(newId);
    }
  }, [onCreateFolder, pendingParentId, onSelect]);

  const handleCancelCreate = useCallback(() => {
    setPendingParentId(undefined);
  }, []);

  const pendingNewFolder: PendingNewFolder | null =
    pendingParentId !== undefined
      ? { parentId: pendingParentId, onConfirm: handleConfirmCreate, onCancel: handleCancelCreate }
      : null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        {onCreateFolder && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={handleStartCreate}
            disabled={pendingParentId !== undefined}
          >
            <FolderPlus className="h-4 w-4" />
            {t('moveItemsDialog.createFolder')}
          </Button>
        )}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('moveItemsDialog.searchFolders')}
            className="h-8 rounded-sm pl-7 pr-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleClearSearch();
              }
            }}
          />
          {query && (
            <button
              type="button"
              aria-label={t('moveItemsDialog.clearSearch')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-sm cursor-pointer border-none bg-transparent"
              onClick={handleClearSearch}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-[300px] max-h-[80vh] w-full rounded-md">
        <ScrollArea className="h-full w-full p-2">
          {/* Root level option — hidden while filtering, it never matches a query */}
          {!isSearching && (
            <div
              className={cn(
                'flex items-center gap-2 py-1 px-2 rounded-sm hover:bg-accent cursor-pointer text-sm w-full mb-1',
                selectedId === null && 'bg-accent',
              )}
              onClick={() => {
                setSelectedId(null);
                onSelect(null);
              }}
            >
              <Folder className="h-4 w-4 text-muted-foreground" />
              <span>{t('moveItemsDialog.rootLevel')}</span>
            </div>
          )}
          {isSearching && filteredTreeData.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {t('moveItemsDialog.noMatchingFolders')}
            </div>
          ) : (
            <TreeView
              items={filteredTreeData}
              onSelect={handleSelect}
              selectedId={selectedId}
              pendingNewFolder={pendingNewFolder}
              searchQuery={trimmedQuery}
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
};
