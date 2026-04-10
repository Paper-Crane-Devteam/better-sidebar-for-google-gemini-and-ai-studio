import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { useArboristTree, STORAGE_KEY } from '../hooks/useArboristTree';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Node } from './node';
import { FolderTintRow } from './node/FolderTintRow';
import { NodeData, ArboristTreeHandle } from '../types';
import { useI18n } from '@/shared/hooks/useI18n';

interface TimelineViewProps {
  onSelect: (item: any) => void;
}

export const TimelineView = forwardRef<ArboristTreeHandle, TimelineViewProps>(
  ({ onSelect }, ref) => {
    const {
      treeRef,
      containerRef,
      dimensions,
      conversations,
      searchTerm,
      initialOpenState,
      onRename,
      onDelete,
      handleToggle,
    } = useArboristTree();

    const { t, currentLanguage } = useI18n();
    const { conversationTags, ui, favorites, setExplorerBatchSelection } =
      useAppStore();
    const { layoutDensity } = useSettingsStore();
    const { tags: tagFilter, typeFilter, onlyFavorites } = ui.explorer;

    const rowHeight = layoutDensity === 'compact' ? 28 : 36;

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
      selectAll: () => {
        const ids: string[] = [];
        data.forEach((group) => {
          if (group.children) {
            group.children.forEach((child) => {
              ids.push(child.id);
            });
          }
        });
        setExplorerBatchSelection(ids);
      },
      open: (id: string) => {
        treeRef.current?.open(id);
      },
    }));

    const data = useMemo(() => {
      // Filter conversations if tags selected
      let filteredConversations = conversations;

      // Filter by type
      if (typeFilter !== 'all') {
        filteredConversations = filteredConversations.filter((c) => {
          const type = c.type || 'conversation';
          return type === typeFilter;
        });
      }

      // Filter by favorites
      if (onlyFavorites) {
        const favoriteIds = new Set(
          favorites
            .filter((f) => f.target_type === 'conversation')
            .map((f) => f.target_id),
        );
        filteredConversations = filteredConversations.filter((c) =>
          favoriteIds.has(c.id),
        );
      }

      if (tagFilter.selected.length > 0) {
        const selectedTagIds = new Set(tagFilter.selected);
        const matchingConversationIds = new Set<string>();

        conversationTags.forEach((ct) => {
          if (selectedTagIds.has(ct.tag_id)) {
            matchingConversationIds.add(ct.conversation_id);
          }
        });

        filteredConversations = filteredConversations.filter((c) =>
          matchingConversationIds.has(c.id),
        );
      }

      console.log(
        'TimelineView: Recalculating data. Conversations:',
        filteredConversations.length,
      );
      const groups = new Map<string, NodeData>();
      const predefinedKeys = [
        'today',
        'yesterday',
        'previous7Days',
        'previous30Days',
      ];

      // Helper to get group info
      const getDateGroupInfo = (timestamp: number) => {
        if (!timestamp) {
          console.log('TimelineView: Missing timestamp', timestamp);
          return {
            key: 'unknown',
            label: t('timeline.unknownDate'),
            sortValue: 0,
          };
        }

        const date = new Date(timestamp);
        const now = new Date();

        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const targetDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        );
        const diffTime = today.getTime() - targetDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0)
          return {
            key: 'today',
            label: t('timeline.today'),
            sortValue: Infinity,
          };
        if (diffDays === 1)
          return {
            key: 'yesterday',
            label: t('timeline.yesterday'),
            sortValue: Infinity - 1,
          };
        if (diffDays <= 7)
          return {
            key: 'previous7Days',
            label: t('timeline.previous7Days'),
            sortValue: Infinity - 2,
          };
        if (diffDays <= 30)
          return {
            key: 'previous30Days',
            label: t('timeline.previous30Days'),
            sortValue: Infinity - 3,
          };

        return {
          key: `month-${date.getFullYear()}-${date.getMonth()}`,
          label: date.toLocaleString(currentLanguage, {
            month: 'long',
            year: 'numeric',
          }),
          sortValue: date.getTime(),
        };
      };

      // Group conversations
      filteredConversations.forEach((c) => {
        const timestamp = c.last_active_at || c.updated_at || c.created_at || 0;
        // Normalize seconds to ms if needed (heuristic)
        const ts =
          timestamp > 0 && timestamp < 100000000000
            ? timestamp * 1000
            : timestamp;

        const { key, label, sortValue } = getDateGroupInfo(ts);

        if (!groups.has(key)) {
          groups.set(key, {
            id: `group-${key}`,
            name: label,
            type: 'folder',
            children: [],
            data: { isTimeGroup: true, sortValue },
          });
        }

        groups.get(key)!.children!.push({
          id: c.id,
          name: c.title || t('common.untitled'),
          type: 'file',
          data: c,
        });
      });

      // Sort groups
      const sortedGroups: NodeData[] = [];

      // Add predefined groups in order
      predefinedKeys.forEach((key) => {
        if (groups.has(key)) {
          sortedGroups.push(groups.get(key)!);
          groups.delete(key);
        }
      });

      // Add remaining groups (Month Year) sorted by sortValue descending
      const remainingGroups = Array.from(groups.values()).sort((a, b) => {
        return (b.data?.sortValue || 0) - (a.data?.sortValue || 0);
      });

      sortedGroups.push(...remainingGroups);

      // Sort children within groups by date descending
      sortedGroups.forEach((group) => {
        group.children!.sort((a, b) => {
          let dateA = a.data?.last_active_at || a.data?.updated_at || a.data?.created_at || 0;
          let dateB = b.data?.last_active_at || b.data?.updated_at || b.data?.created_at || 0;
          if (dateA > 0 && dateA < 100000000000) dateA *= 1000;
          if (dateB > 0 && dateB < 100000000000) dateB *= 1000;

          return dateB - dateA;
        });
      });

      return sortedGroups;
    }, [
      conversations,
      tagFilter.selected,
      conversationTags,
      typeFilter,
      onlyFavorites,
      favorites,
      t,
      currentLanguage,
    ]);

    // Render wrapper to inject extra props
    const NodeWrapper = (props: NodeRendererProps<NodeData>) => {
      return <Node {...props} />;
    };

    return (
      <div ref={containerRef} className="h-full w-full">
        <Tree
          ref={treeRef}
          data={data}
          onMove={undefined} // Disable drag/drop
          onRename={onRename}
          onDelete={onDelete}
          onSelect={onSelect}
          onToggle={handleToggle}
          width={dimensions.width}
          height={dimensions.height}
          indent={0}
          rowHeight={rowHeight}
          openByDefault={false}
          initialOpenState={initialOpenState}
          searchTerm={searchTerm}
          searchMatch={(node, term) =>
            node.data.name.toLowerCase().includes(term.toLowerCase())
          }
          disableDrag={true}
          disableDrop={true}
          renderRow={FolderTintRow}
        >
          {NodeWrapper}
        </Tree>
      </div>
    );
  },
);
