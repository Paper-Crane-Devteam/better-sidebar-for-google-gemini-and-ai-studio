import React from 'react';
import { Copy, Edit2, ExternalLink, MessageSquarePlus, Trash2 } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { navigate, navigateToGem } from '@/shared/lib/navigation';
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

/** A gem row (or one of its chats) in the Gems panel. */
export const GemNode = (props: NodeRendererProps<FolderTreeNodeData>) => {
  const { node } = props;
  const { t } = useI18n();
  const searchQuery = useAppStore((state) => state.ui.gems.search.query);
  const gemUrl: string | undefined = node.data.data?.external_url;

  const handleDeleteGem = async () => {
    const confirmed = await modal.confirmDelete({
      title: t('gems.deleteGem'),
      content: t('gems.deleteGemConfirm', { name: node.data.name }),
    });
    if (!confirmed) return;
    // Delete on Gemini first; our row goes regardless.
    try {
      window.dispatchEvent(
        new CustomEvent('GEMINI_API_EXECUTE', {
          detail: {
            rpcid: 'UXcSJb',
            payload: [node.data.id],
            callbackEvent: `GEMINI_DELETE_GEM_RESULT_${node.data.id}`,
          },
        }),
      );
    } catch {
      // non-critical
    }
    await browser.runtime.sendMessage({
      type: 'DELETE_GEM',
      payload: { id: node.data.id },
    });
    useAppStore.getState().fetchData(true);
  };

  const buildItemMenu = ({ pin, moveToFolder, setDefaultFolder }: SharedItemMenu): MenuEntryDef[] => [
    pin,
    // — Navigation —
    {
      type: 'item',
      key: 'open-gem',
      icon: <UIcon icon="tabler:diamond" className="h-4 w-4" />,
      label: t('gems.openGem'),
      onClick: () => {
        if (gemUrl) navigateToGem(gemUrl);
      },
    },
    {
      type: 'item',
      key: 'open-new-tab',
      icon: <ExternalLink className="h-4 w-4" />,
      label: t('gems.openInNewTab'),
      onClick: () => {
        if (gemUrl) window.open(gemUrl, '_blank');
      },
    },
    { type: 'separator', key: 'sep-nav' },
    // — Manage —
    moveToFolder,
    setDefaultFolder,
    {
      type: 'item',
      key: 'edit-gem',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('gems.editGem'),
      onClick: () => navigate(`https://gemini.google.com/gems/edit/${node.data.id}`),
    },
    {
      type: 'item',
      key: 'copy-gem',
      icon: <Copy className="h-4 w-4" />,
      label: t('gems.copyGem'),
      onClick: () => navigate(`https://gemini.google.com/gems/copy/${node.data.id}`),
    },
    { type: 'separator', key: 'sep-manage' },
    // — Destructive —
    {
      type: 'item',
      key: 'delete-gem',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('gems.deleteGem'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => void handleDeleteGem(),
    },
  ];

  const itemActions: ActionButtonDef[] = [
    {
      icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
      tooltip: t('gems.newGemChat'),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigateToGem(node.data.id);
      },
    },
  ];

  return (
    <CollectionItemNode
      {...props}
      scope="gems"
      buildItemMenu={buildItemMenu}
      itemActions={itemActions}
      searchQuery={searchQuery}
    />
  );
};
