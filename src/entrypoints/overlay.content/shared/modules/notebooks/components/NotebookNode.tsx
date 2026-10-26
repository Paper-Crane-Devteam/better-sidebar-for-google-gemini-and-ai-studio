import React from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { navigateToNewChat, navigateToNotebook } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../components/folder-tree/types';
import type {
  ActionButtonDef,
  MenuEntryDef,
} from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { CollectionItemNode, type SharedItemMenu } from '../../collections/CollectionItemNode';

/** A notebook row (or one of its chats) in the Notebooks panel. */
export const NotebookNode = (props: NodeRendererProps<FolderTreeNodeData>) => {
  const { node } = props;
  const { t } = useI18n();
  const searchQuery = useAppStore((state) => state.ui.notebooks.search.query);

  const handleDeleteNotebook = async () => {
    const confirmed = await modal.confirmDelete({
      title: t('notebooks.deleteNotebook'),
      content: t('notebooks.deleteNotebookConfirm', { name: node.data.name }),
    });
    if (!confirmed) return;
    // Delete on Gemini (rpcid: Nwkn9); our row goes regardless.
    try {
      window.dispatchEvent(
        new CustomEvent('GEMINI_API_EXECUTE', {
          detail: {
            rpcid: 'Nwkn9',
            payload: [`notebooks/${node.data.id}`],
            callbackEvent: `GEMINI_DELETE_NOTEBOOK_RESULT_${node.data.id}`,
          },
        }),
      );
    } catch {
      // non-critical
    }
    await browser.runtime.sendMessage({
      type: 'DELETE_NOTEBOOK',
      payload: { id: node.data.id },
    });

    // Leave the notebook page if it is the one being deleted
    try {
      const path = decodeURIComponent(window.location.pathname);
      if (
        path.includes(`/notebook/${node.data.id}`) ||
        path.includes(`/notebook/notebooks/${node.data.id}`)
      ) {
        navigateToNewChat();
      }
    } catch {
      // non-critical
    }
    useAppStore.getState().fetchData(true);
  };

  const buildItemMenu = ({ pin, moveToFolder, setDefaultFolder }: SharedItemMenu): MenuEntryDef[] => [
    pin,
    {
      type: 'item',
      key: 'open-new-tab',
      icon: <ExternalLink className="h-4 w-4" />,
      label: t('notebooks.openInNewTab'),
      onClick: () => {
        const nbUrl =
          node.data.data?.external_url ||
          `https://gemini.google.com/notebook/notebooks%2F${node.data.id}`;
        window.open(nbUrl, '_blank');
      },
    },
    { type: 'separator', key: 'sep-manage' },
    moveToFolder,
    setDefaultFolder,
    { type: 'separator', key: 'sep-delete' },
    {
      type: 'item',
      key: 'delete-notebook',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('notebooks.deleteNotebook'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => void handleDeleteNotebook(),
    },
  ];

  const itemActions: ActionButtonDef[] = [
    {
      icon: <UIcon icon="tabler:notebook" className="h-3.5 w-3.5" />,
      tooltip: t('notebooks.newNotebookChat'),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigateToNotebook(node.data.id);
      },
    },
  ];

  return (
    <CollectionItemNode
      {...props}
      scope="notebooks"
      buildItemMenu={buildItemMenu}
      itemActions={itemActions}
      searchQuery={searchQuery}
    />
  );
};
