import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { usePromptsTree, STORAGE_KEY } from '../hooks/usePromptsTree';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Node } from './node';
import { NodeData, ArboristTreeHandle } from '../types';
import { useI18n } from '@/shared/hooks/useI18n';

export type { ArboristTreeHandle } from '../types';

interface PromptsTreeProps {
  onSelect: (item: any) => void;
  onPreview: (prompt: any) => void;
}

const NodeWrapper = (
  props: NodeRendererProps<NodeData> & { onPreview: (prompt: any) => void },
) => {
  return <Node {...props} onPreview={props.onPreview} />;
};

export const PromptsTree = forwardRef<ArboristTreeHandle, PromptsTreeProps>(
  ({ onSelect, onPreview }, ref) => {
    const {
      treeRef,
      containerRef,
      dimensions,
      folders,
      conversations,
      searchTerm,
      initialOpenState,
      ui,
      onMove,
      onRename,
      onDelete,
      handleToggle,
    } = usePromptsTree();

    const { t } = useI18n();
    const { favorites } = useAppStore();
    const { sortOrder, typeFilter, onlyFavorites } = ui.prompts;
    const layoutDensity = useSettingsStore((state) => state.layoutDensity);

    const rowHeight = layoutDensity === 'compact' ? 32 : 38;

    useImperativeHandle(ref, () => ({
      collapseAll: () => {
        treeRef.current?.closeAll();
        localStorage.removeItem(STORAGE_KEY);
      },
      edit: (id: string) => {
        treeRef.current?.edit(id);
      },
      select: (id: string) => {
        treeRef.current?.select(id);
        treeRef.current?.scrollTo(id);
      },
      open: (id: string) => {
        treeRef.current?.open(id);
      },
    }));

    const data = useMemo(() => {
      const folderMap = new Map<string, NodeData>();

      folders.forEach((f) => {
        folderMap.set(f.id, {
          id: f.id,
          name: f.name,
          type: 'folder',
          children: [],
          data: f,
        });
      });

      const rootNodes: NodeData[] = [];

      let filteredPrompts = conversations;

      if (typeFilter !== 'all') {
        filteredPrompts = filteredPrompts.filter((c) => {
          const type = c.type || 'normal';
          return type === typeFilter;
        });
      }

      if (onlyFavorites) {
        const favoriteIds = new Set(
          favorites
            .filter((f) => f.target_type === 'prompt')
            .map((f) => f.target_id),
        );
        filteredPrompts = filteredPrompts.filter((c) => favoriteIds.has(c.id));
      }

      filteredPrompts.forEach((c) => {
        const item: NodeData = {
          id: c.id,
          name: c.title || t('common.untitled'),
          type: 'file',
          data: c,
        };

        if (c.folder_id && folderMap.has(c.folder_id)) {
          folderMap.get(c.folder_id)!.children!.push(item);
        } else {
          rootNodes.push(item);
        }
      });

      folders.forEach((f) => {
        const node = folderMap.get(f.id);
        if (!node) return;

        if (f.parent_id && folderMap.has(f.parent_id)) {
          folderMap.get(f.parent_id)!.children!.push(node);
        } else {
          rootNodes.push(node);
        }
      });

      const favoriteIds = new Set(
        favorites
          .filter((f) => f.target_type === 'prompt')
          .map((f) => f.target_id),
      );

      const sortNodes = (nodes: NodeData[]) => {
        nodes.sort((a, b) => {
          const isAFav = favoriteIds.has(a.id);
          const isBFav = favoriteIds.has(b.id);

          if (isAFav && !isBFav) return -1;
          if (!isAFav && isBFav) return 1;

          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }

          if (sortOrder === 'date') {
            if (a.type === 'folder') {
              return a.name.localeCompare(b.name);
            }

            let dateA = a.data?.updated_at || a.data?.created_at || 0;
            let dateB = b.data?.updated_at || b.data?.created_at || 0;

            if (dateA > 0) dateA *= 1000;
            if (dateB > 0) dateB *= 1000;

            return dateB - dateA;
          }

          return a.name.localeCompare(b.name);
        });
        nodes.forEach((node) => {
          if (node.children) sortNodes(node.children);
        });
      };

      sortNodes(rootNodes);
      return rootNodes;
    }, [
      folders,
      conversations,
      sortOrder,
      favorites,
      typeFilter,
      onlyFavorites,
      t,
    ]);

    return (
      <div ref={containerRef} className="h-full w-full">
        <Tree
          padding={2}
          ref={treeRef}
          data={data}
          onMove={onMove}
          onRename={onRename}
          onDelete={onDelete}
          onSelect={onSelect}
          onToggle={handleToggle}
          width={dimensions.width}
          height={dimensions.height}
          indent={8}
          rowHeight={rowHeight}
          openByDefault={false}
          initialOpenState={initialOpenState}
          searchTerm={searchTerm}
          searchMatch={(node, term) =>
            node.data.name.toLowerCase().includes(term.toLowerCase())
          }
        >
          {(props) => <NodeWrapper {...props} onPreview={onPreview} />}
        </Tree>
      </div>
    );
  },
);
