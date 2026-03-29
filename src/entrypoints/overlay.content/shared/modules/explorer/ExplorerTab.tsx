import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '../../components/ui/button';
import { RefreshCw, Loader2, FolderPlus } from 'lucide-react';
import { ExplorerHeader } from './components/ExplorerHeader';
import { ArboristTree, ArboristTreeHandle } from './components/ArboristTree';
import { navigate } from '@/shared/lib/navigation';
import { useCurrentConversationId } from '../../hooks/useCurrentConversationId';
import { FilterBar } from '../../components/FilterBar';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';

import type { ExplorerTypeFilter } from '../../types/filter';
import type { SplitDropdownItem } from '@/shared/components/ui/split-icon-button';
import { getExternalUrl } from '../../utils';
import { ExplorerContext } from './ExplorerContext';

interface ExplorerTabProps {
  onNewChat: () => void;
  newChatDropdownItems?: SplitDropdownItem[];
  filterTypes?: ExplorerTypeFilter[];
  extraHeaderButtons?: React.ReactNode;
  visibleFilters?: ('search' | 'tags' | 'type' | 'favorites')[];
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    onImportAiStudioSystem?: () => void;
  };
}

export const ExplorerTab = ({
  onNewChat,
  newChatDropdownItems,
  filterTypes,
  extraHeaderButtons,
  visibleFilters,
  menuActions,
}: ExplorerTabProps) => {
  const { t } = useI18n();
  const {
    folders,
    conversations,
    isLoading,
    createFolder,
    fetchData,
    ui,
    tags: allTags,
    setIsScanning,
  } = useAppStore();

  const { isScanning } = ui.overlay;
  const { viewMode } = ui.explorer;
  const filter = useStoreFilter('explorer');

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;

  const treeRef = useRef<ArboristTreeHandle>(null);
  const currentConversationId = useCurrentConversationId();
  const lastProcessedConversationIdRef = useRef<string | null>(null);
  const lastConversationIdsRef = useRef<Set<string>>(new Set());

  // Clear stale selection
  useEffect(() => {
    if (folders.length === 0 && conversations.length === 0) {
      setSelectedNode(null);
      return;
    }

    if (selectedNode) {
      const { id, type, data } = selectedNode.data;

      // Skip virtual time groups
      if (data?.isTimeGroup) return;

      if (type === 'folder') {
        const exists = folders.some((f) => f.id === id);
        if (!exists) setSelectedNode(null);
      } else if (type === 'file') {
        const exists = conversations.some((c) => c.id === id);
        if (!exists) setSelectedNode(null);
      }
    }
  }, [folders, conversations, selectedNode]);

  // Handle New Chat Creation (Listen to event from Main World)
  useEffect(() => {
    const handleCreate = async (event: any) => {
      const { id, title, prompt_metadata, created_at, type, messages, gem_id } =
        event.detail;
      console.log(
        'Better Sidebar for Gemini & AI Studio: Overlay received BETTER_SIDEBAR_PROMPT_CREATE',
        id,
      );

      let targetFolderId = null;
      if (selectedNode) {
        if (selectedNode.data.type === 'folder') {
          // Check if it's a virtual time group folder
          if (selectedNode.data.data?.isTimeGroup) {
            targetFolderId = null;
          } else {
            targetFolderId = selectedNode.data.id;
          }
        } else {
          const item = selectedNode.data.data;
          targetFolderId = item.folder_id || null;
        }
      }

      try {
        await browser.runtime.sendMessage({
          type: 'SAVE_CONVERSATION',
          payload: {
            id,
            title,
            prompt_metadata,
            created_at,
            updated_at: created_at,
            external_id: id,
            external_url: getExternalUrl(id),
            folder_id: targetFolderId,
            type,
            messages,
            gem_id: gem_id || undefined,
          },
        });
        // Refresh data to show new item immediately
        fetchData(true);
      } catch (e) {
        console.error(
          'Better Sidebar for Gemini & AI Studio: Failed to handle BETTER_SIDEBAR_PROMPT_CREATE',
          e,
        );
      }
    };

    globalThis.addEventListener('BETTER_SIDEBAR_PROMPT_CREATE', handleCreate);
    return () =>
      globalThis.removeEventListener(
        'BETTER_SIDEBAR_PROMPT_CREATE',
        handleCreate,
      );
  }, [selectedNode, fetchData]);


  // Handle URL changes to auto-select prompt
  useEffect(() => {
    if (currentConversationId) {
      // Prevent redundant selection which might steal focus
      if (selectedNodeRef.current?.data?.id === currentConversationId) return;

      // Get current conversation IDs set
      const currentConversationIds = new Set(conversations.map((c) => c.id));

      // Check if we need to process this:
      // 1. currentConversationId changed, OR
      // 2. conversations changed and the currentConversationId is now available (wasn't before)
      const conversationIdChanged =
        lastProcessedConversationIdRef.current !== currentConversationId;
      const conversationBecameAvailable =
        !lastConversationIdsRef.current.has(currentConversationId) &&
        currentConversationIds.has(currentConversationId);

      if (conversationIdChanged || conversationBecameAvailable) {
        const exists = conversations.some(
          (c) => c.id === currentConversationId,
        );
        if (exists) {
          treeRef.current?.select(currentConversationId);
        }
        lastProcessedConversationIdRef.current = currentConversationId;
      }

      // Update the conversation IDs set
      lastConversationIdsRef.current = currentConversationIds;
    } else {
      // Reset when currentConversationId becomes null
      lastProcessedConversationIdRef.current = null;
    }
  }, [currentConversationId, conversations]);

  const handleSelect = (nodes: any[]) => {
    if (nodes.length > 0) {
      setSelectedNode(nodes[0]);
    } else {
      setSelectedNode(null);
    }
  };

  const handleNewFolder = async () => {
    let parentId: string | null = null;
    if (selectedNode) {
      if (selectedNode.data.type === 'folder') {
        if (selectedNode.data.data?.isTimeGroup) {
          parentId = null;
        } else {
          parentId = selectedNode.data.id;
        }
      } else {
        const item = selectedNode.data.data;
        parentId = item.folder_id || null;
      }
    }
    const newFolderId = await createFolder(t('sidebar.newFolder'), parentId);
    if (newFolderId) {
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  const handleCreateRootFolder = async () => {
    const newFolderId = await createFolder(t('sidebar.newFolder'), null);
    if (newFolderId) {
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  const handleCollapseAll = () => {
    treeRef.current?.collapseAll();
  };

  const handleSelectAll = () => {
    treeRef.current?.selectAll?.();
  };

  const handleScanLibrary = () => {
    if (isScanning) return;
    setIsScanning(true);
    browser.runtime.sendMessage({ type: 'SCAN_LIBRARY' });
  };

  return (
    <ExplorerContext.Provider value={{ onNewChat }}>
    <div className="flex flex-col h-full w-full relative">
      {isScanning && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[1px] gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('explorer.scanning')}
          </p>
        </div>
      )}
      {/* Header */}
      <ExplorerHeader
        onNewFolder={handleNewFolder}
        onCollapseAll={handleCollapseAll}
        onSelectAll={handleSelectAll}
        onNewChat={onNewChat}
        newChatDropdownItems={newChatDropdownItems}
        filter={filter}
        filterTypes={filterTypes}
        extraHeaderButtons={extraHeaderButtons}
        visibleFilters={visibleFilters}
        menuActions={{
          ...menuActions,
          handleScanLibrary,
        }}
      />

      <FilterBar filter={filter} allTags={allTags} />

      {/* Content */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-hidden relative">
            {(() => {
              if (
                isLoading &&
                folders.length === 0 &&
                conversations.length === 0
              ) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                  </div>
                );
              }

              if (
                !isScanning &&
                folders.length === 0 &&
                conversations.length === 0
              ) {
                return (
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-4">
                    <p>{t('explorer.noConversations')}</p>
                    <p>{t('explorer.scanPrompt')}</p>
                    <Button onClick={handleScanLibrary} className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t('explorer.scanLibrary')}
                    </Button>
                  </div>
                );
              }
              return <ArboristTree ref={treeRef} onSelect={handleSelect} />;
            })()}
          </div>
        </ContextMenuTrigger>
        {viewMode === 'tree' && (
          <ContextMenuContent>
            <ContextMenuItem onClick={handleCreateRootFolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              {t('sidebar.newFolder')}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    </div>
    </ExplorerContext.Provider>
  );
};;
