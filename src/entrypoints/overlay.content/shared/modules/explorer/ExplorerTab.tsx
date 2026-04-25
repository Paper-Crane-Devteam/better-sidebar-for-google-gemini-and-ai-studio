import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  // Track which folder a new chat is being created in (for loading state)
  const [pendingNewChatFolderId, setPendingNewChatFolderId] = useState<string | null>(null);
  // Track whether the user clicked "new chat" from a folder (waiting for generate)
  const pendingFolderRef = useRef<string | null>(null);
  // Skip scrollTo when auto-selecting a newly created conversation
  const skipScrollForIdRef = useRef<string | null>(null);

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

  // Wrap onNewChat to record the target folder and expand it
  const handleNewChatFromFolder = useCallback(() => {
    if (selectedNode && selectedNode.data.type === 'folder' && !selectedNode.data.data?.isTimeGroup) {
      pendingFolderRef.current = selectedNode.data.id;
      // Expand the folder so the loading entry is visible
      treeRef.current?.open(selectedNode.data.id);
    } else {
      pendingFolderRef.current = null;
    }
    onNewChat();
  }, [selectedNode, onNewChat]);

  // Called from folder node action bar with explicit folderId
  const handleNewChatInFolder = useCallback((folderId: string) => {
    pendingFolderRef.current = folderId;
    treeRef.current?.open(folderId);
    onNewChat();
  }, [onNewChat]);

  // Listen for generate request start → show loading entry in the pending folder
  useEffect(() => {
    const handleGenerateStart = () => {
      if (pendingFolderRef.current) {
        setPendingNewChatFolderId(pendingFolderRef.current);
        pendingFolderRef.current = null;
      }
    };
    globalThis.addEventListener('BETTER_SIDEBAR_GENERATE_START', handleGenerateStart);
    return () => globalThis.removeEventListener('BETTER_SIDEBAR_GENERATE_START', handleGenerateStart);
  }, []);

  // Safety timeout: clear loading state after 30s in case the event never fires
  useEffect(() => {
    if (!pendingNewChatFolderId) return;
    const timer = setTimeout(() => setPendingNewChatFolderId(null), 30000);
    return () => clearTimeout(timer);
  }, [pendingNewChatFolderId]);

  // Handle New Chat Creation — assign to selected folder if one is active.
  // The actual DB save is handled by PromptCreateScanner in the content script,
  // so this only needs to move the conversation when a folder is selected.
  useEffect(() => {
    const handleCreate = async (event: any) => {
      const { id } = event.detail;

      // Clear loading state — the real conversation will appear after fetchData
      setPendingNewChatFolderId(null);
      // The folder is already in view; don't scroll the tree when auto-selecting this id
      skipScrollForIdRef.current = id;

      let targetFolderId: string | null = null;
      if (selectedNode) {
        if (selectedNode.data.type === 'folder') {
          if (!selectedNode.data.data?.isTimeGroup) {
            targetFolderId = selectedNode.data.id;
          }
        } else {
          targetFolderId = selectedNode.data.data?.folder_id || null;
        }
      }

      // Always refresh so the new item appears immediately
      fetchData(true);

      if (!targetFolderId) return;

      try {
        await browser.runtime.sendMessage({
          type: 'MOVE_CONVERSATION',
          payload: { id, folderId: targetFolderId },
        });
        fetchData(true);
      } catch (e) {
        console.error(
          'Better Sidebar for Gemini & AI Studio: Failed to move new conversation to folder',
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
      // If user navigated to an existing conversation, discard any pending new-chat intent
      pendingFolderRef.current = null;

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
          // Skip select entirely when the conversation was just created in a folder —
          // react-arborist's select() always scrolls internally and there's no way to opt out.
          if (skipScrollForIdRef.current !== currentConversationId) {
            treeRef.current?.select(currentConversationId);
          }
        }
        lastProcessedConversationIdRef.current = currentConversationId;
      }

      // Once the conversation is selected and stable, clear the skip flag
      if (skipScrollForIdRef.current && skipScrollForIdRef.current !== currentConversationId) {
        skipScrollForIdRef.current = null;
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
    <ExplorerContext.Provider value={{ onNewChat: handleNewChatFromFolder, onNewChatInFolder: handleNewChatInFolder, pendingNewChatFolderId }}>
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
        onNewChat={handleNewChatFromFolder}
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
      <ContextMenu modal={false}>
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
