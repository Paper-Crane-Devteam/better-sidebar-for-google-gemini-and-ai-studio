import React, { useMemo, useState } from 'react';
import { TreeView } from '@/shared/components/ui/tree-view';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils/utils';
import { Folder } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';

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
}

export const FolderPicker = ({
  folders,
  onSelect,
  selectedIds = [],
  initialSelectedId = null,
  className,
}: FolderPickerProps) => {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

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

  const handleSelect = (item: any) => {
    setSelectedId(item.id);
    onSelect(item.id);
  };

  return (
    <div className={cn('min-h-[300px] max-h-[80vh] w-full border rounded-md', className)}>
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
