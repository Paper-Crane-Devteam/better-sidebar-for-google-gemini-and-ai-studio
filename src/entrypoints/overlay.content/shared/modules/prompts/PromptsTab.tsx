import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { Button } from '../../components/ui/button';
import { Loader2, FolderPlus, Plus } from 'lucide-react';
import { PromptsHeader } from './components/PromptsHeader';
import { FilterBar } from '../../components/FilterBar';
import { PromptsTree, ArboristTreeHandle } from './components/PromptsTree';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';

import { CreatePromptForm } from './components/CreatePromptForm';
import { PromptPreviewContent } from './components/PromptPreviewContent';
import { PromptIconDisplay } from './lib/prompt-icons';
import { modal } from '@/shared/lib/modal';

interface PromptsTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    onImportAiStudioSystem?: () => void;
  };
}

export const PromptsTab = ({ menuActions }: PromptsTabProps) => {
  const { t } = useI18n();
  const {
    promptFolders,
    prompts,
    isLoading,
    createPromptFolder,
    createPrompt,
    updatePrompt,
    ui,
  } = useAppStore();

  const filter = useStoreFilter('prompts');

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const selectedNodeRef = useRef(selectedNode);
  selectedNodeRef.current = selectedNode;
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);

  const openPreviewModal = (prompt: any) => {
    useModalStore.getState().open({
      type: 'confirm',
      title: (
        <span className="flex items-center gap-2 min-w-0">
          <PromptIconDisplay name={prompt.icon} className="h-5 w-5 shrink-0" />
          <span className="break-words">{prompt.title}</span>
        </span>
      ),
      content: <PromptPreviewContent prompt={prompt} />,
      confirmText: t('common.close'),
      cancelText: t('prompts.editPrompt', 'Edit'),
      onConfirm: () => useModalStore.getState().close(),
      onCancel: () => {
        useModalStore.getState().close();
        openEditModal(prompt);
      },
      modalClassName: 'max-w-2xl',
    });
  };

  const openEditModal = (prompt: any) => {
    let editFormData: {
      title: string;
      content: string;
      type: 'normal' | 'system';
      icon: string;
    } = {
      title: prompt.title ?? '',
      content: prompt.content ?? '',
      type: (prompt.type as 'normal' | 'system') ?? 'system',
      icon: prompt.icon ?? 'Bot',
    };
    useModalStore.getState().open({
      type: 'confirm',
      title: t('prompts.editPrompt', 'Edit Prompt'),
      content: (
        <CreatePromptForm
          formRef={editFormRef}
          initialValues={editFormData}
          onChange={(d) => (editFormData = d)}
          onValidSubmit={() => {
            updatePrompt(prompt.id, editFormData);
            useModalStore.getState().close();
          }}
        />
      ),
      confirmText: t('common.save', 'Save'),
      cancelText: t('common.cancel'),
      onConfirm: () => editFormRef.current?.requestSubmit(),
      onCancel: () => useModalStore.getState().close(),
      modalClassName: 'max-w-2xl',
    });
  };

  const treeRef = useRef<ArboristTreeHandle>(null);


  // Clear stale selection
  useEffect(() => {
    if (promptFolders.length === 0 && prompts.length === 0) {
      setSelectedNode(null);
      return;
    }

    if (selectedNode) {
      const { id, type } = selectedNode.data;
      if (type === 'folder') {
        const exists = promptFolders.some((f) => f.id === id);
        if (!exists) setSelectedNode(null);
      } else if (type === 'file') {
        const exists = prompts.some((c) => c.id === id);
        if (!exists) setSelectedNode(null);
      }
    }
  }, [promptFolders, prompts, selectedNode]);

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
    const newFolderId = await createPromptFolder(
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
    const newFolderId = await createPromptFolder(t('sidebar.newFolder'), null);
    if (newFolderId) {
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  const handleNewPrompt = () => {
    let formData: {
      title: string;
      content: string;
      type: 'normal' | 'system';
      icon: string;
    } = {
      title: '',
      content: '',
      type: 'system',
      icon: 'Bot',
    };
    let folderId: string | null = null;
    if (selectedNode) {
      if (selectedNode.data.type === 'folder') {
        folderId = selectedNode.data.id;
      } else {
        folderId = selectedNode.data.data.folder_id;
      }
    }
    useModalStore.getState().open({
      type: 'confirm',
      title: t('prompts.createPrompt'),
      content: (
        <CreatePromptForm
          formRef={createFormRef}
          onChange={(d) => (formData = d)}
          onValidSubmit={() => {
            useModalStore.getState().close();
            createPrompt(
              formData.title,
              formData.content,
              formData.type,
              formData.icon,
              folderId,
            );
          }}
        />
      ),
      confirmText: t('common.create'),
      cancelText: t('common.cancel'),
      onConfirm: () => createFormRef.current?.requestSubmit(),
      onCancel: () => useModalStore.getState().close(),
      modalClassName: 'max-w-2xl',
    });
  };

  const handleCollapseAll = () => {
    treeRef.current?.collapseAll();
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Header */}
      <PromptsHeader
        onNewFolder={handleNewFolder}
        onCollapseAll={handleCollapseAll}
        onNewChat={handleNewPrompt}
        filter={filter}
        menuActions={menuActions}
      />

      <FilterBar filter={filter} allTags={[]} />

      {/* Content */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-hidden relative">
            {(() => {
              if (
                isLoading &&
                promptFolders.length === 0 &&
                prompts.length === 0
              ) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                  </div>
                );
              }
              // Removed "Scan Library" empty state as it doesn't apply to prompts
              if (
                !isLoading &&
                promptFolders.length === 0 &&
                prompts.length === 0
              ) {
                return (
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-4">
                    <p>{t('prompts.noPrompts')}</p>
                    <Button onClick={handleNewPrompt} className="gap-2">
                      <Plus className="h-4 w-4" />
                      {t('prompts.createPrompt')}
                    </Button>
                  </div>
                );
              }

              return (
                <PromptsTree
                  ref={treeRef}
                  onSelect={handleSelect}
                  onPreview={openPreviewModal}
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
      </ContextMenu>
    </div>
  );
};;
