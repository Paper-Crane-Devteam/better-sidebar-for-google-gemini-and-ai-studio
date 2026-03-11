import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { TreeView } from '@/shared/components/ui/tree-view';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils/utils';
import { Folder } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';

interface MoveItemsDialogProps {
  onSelect: (folderId: string | null) => void;
  selectedIds: string[]; // IDs of items being moved, to prevent moving a folder into itself
}

export const MoveItemsDialog = ({
  onSelect,
  selectedIds,
}: MoveItemsDialogProps) => {
  const { t } = useI18n();
  const folders = useAppStore((state) => state.promptFolders);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const treeData = useMemo(() => {
    const folderMap = new Map<string, any>();
    const rootNodes: any[] = [];

    // Initialize map
    folders.forEach((f) => {
      folderMap.set(f.id, {
        id: f.id,
        name: f.name,
        type: 'folder',
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
  }, [folders]);

  const handleSelect = (item: any) => {
    setSelectedId(item.id);
    onSelect(item.id);
  };

  return (
    <div className="min-h-[300px] max-h-[80vh] w-full border rounded-md">
      <ScrollArea className="h-full w-full p-2">
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
        <TreeView
          items={treeData}
          onSelect={handleSelect}
          selectedId={selectedId}
        />
      </ScrollArea>
    </div>
  );
};
