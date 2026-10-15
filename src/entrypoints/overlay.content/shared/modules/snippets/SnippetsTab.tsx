import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { Button } from '@/shared/components/ui/button';
import { Loader2, FolderPlus, Plus } from 'lucide-react';
import { SnippetsHeader } from './components/SnippetsHeader';
import { SnippetsTree, SnippetsTreeHandle } from './components/SnippetsTree';
import { FilterBar } from '../../components/FilterBar';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { ExclusiveContextMenu } from '../../components/ui/exclusive-context-menu';
import { CreateSnippetForm } from './components/CreateSnippetForm';
import { useShallow } from 'zustand/react/shallow';

interface SnippetsTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
}

export const SnippetsTab = ({ menuActions }: SnippetsTabProps) => {
  const { t } = useI18n();
  const {
    snippetFolders,
    snippets,
    isLoading,
    createSnippetFolder,
    createSnippet,
    updateSnippet,
    openSnippetReaderDrawer,
  } = useAppStore(
    useShallow((s) => ({
      snippetFolders: s.snippetFolders,
      snippets: s.snippets,
      isLoading: s.isLoading,
      createSnippetFolder: s.createSnippetFolder,
      createSnippet: s.createSnippet,
      updateSnippet: s.updateSnippet,
      openSnippetReaderDrawer: s.openSnippetReaderDrawer,
    })),
  );

  const filter = useStoreFilter('snippets');

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);

  const treeRef = useRef<SnippetsTreeHandle>(null);

  const openPreviewModal = (snippet: any) => {
    // Open the reader drawer instead of a modal
    openSnippetReaderDrawer(snippet.folder_id, snippet.id);
  };

  const openEditModal = (snippet: any) => {
    let editFormData: {
      title: string;
      content: string;
    } = {
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
  };

  // Clear stale selection
  useEffect(() => {
    if (snippetFolders.length === 0 && snippets.length === 0) {
      setSelectedNode(null);
      return;
    }

    if (selectedNode) {
      const { id, type } = selectedNode.data;
      if (type === 'folder') {
        const exists = snippetFolders.some((f) => f.id === id);
        if (!exists) setSelectedNode(null);
      } else if (type === 'file') {
        const exists = snippets.some((s) => s.id === id);
        if (!exists) setSelectedNode(null);
      }
    }
  }, [snippetFolders, snippets, selectedNode]);

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
        parentId = selectedNode.data.id;
      } else {
        const item = selectedNode.data.data;
        parentId = item.folder_id || null;
      }
    }
    const newFolderId = await createSnippetFolder(
      t('sidebar.newFolder'),
      parentId,
    );
    if (newFolderId) {
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  const handleCreateRootFolder = async () => {
    const newFolderId = await createSnippetFolder(t('sidebar.newFolder'), null);
    if (newFolderId) {
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  const handleNewSnippet = () => {
    let formData: {
      title: string;
      content: string;
    } = {
      title: '',
      content: '',
    };
    let folderId: string | null = null;
    if (selectedNode) {
      if (selectedNode.data.type === 'folder') {
        folderId = selectedNode.data.id;
      } else {
        folderId = selectedNode.data.data.folder_id;
      }
    }

    const doCreate = () => {
      if (!formData.title.trim()) {
        console.warn('[Snippets] doCreate: title is empty, formData:', formData);
        return;
      }
      useModalStore.getState().close();
      createSnippet(
        formData.title,
        formData.content,
        null,
        null,
        folderId,
      );
    };

    useModalStore.getState().open({
      type: 'confirm',
      title: t('snippets.createSnippet'),
      content: (
        <CreateSnippetForm
          formRef={createFormRef}
          onChange={(d) => (formData = d)}
          onValidSubmit={doCreate}
        />
      ),
      confirmText: t('common.create'),
      cancelText: t('common.cancel'),
      onConfirm: doCreate,
      onCancel: () => useModalStore.getState().close(),
      modalClassName: 'max-w-2xl',
    });
  };

  const handleCollapseAll = () => {
    treeRef.current?.collapseAll();
  };

  const handleSelectAll = () => {
    treeRef.current?.selectAll?.();
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Header */}
      <SnippetsHeader
        onNewFolder={handleNewFolder}
        onCollapseAll={handleCollapseAll}
        onSelectAll={handleSelectAll}
        onNewSnippet={handleNewSnippet}
        filter={filter}
        menuActions={menuActions}
      />

      <FilterBar filter={filter} allTags={[]} />

      {/* Content */}
      <ExclusiveContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-hidden relative">
            {(() => {
              if (
                isLoading &&
                snippetFolders.length === 0 &&
                snippets.length === 0
              ) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                  </div>
                );
              }
              if (
                !isLoading &&
                snippetFolders.length === 0 &&
                snippets.length === 0
              ) {
                return (
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-4">
                    <p>{t('snippets.noSnippets')}</p>
                    <Button onClick={handleNewSnippet} className="gap-2">
                      <Plus className="h-4 w-4" />
                      {t('snippets.createSnippet')}
                    </Button>
                  </div>
                );
              }

              return (
                <SnippetsTree
                  ref={treeRef}
                  onSelect={handleSelect}
                  onPreview={openPreviewModal}
                  onEdit={openEditModal}
                />
              );
            })()}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={handleCreateRootFolder}>
            <FolderPlus className="mr-2 h-4 w-4" />
            {t('sidebar.newFolder')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ExclusiveContextMenu>
    </div>
  );
};
