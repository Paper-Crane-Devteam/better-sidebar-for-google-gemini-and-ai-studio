import React from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import {
  fetchMessagesForExport,
  buildExportMarkdown,
} from '../../lib/exportConversation';
import {
  FolderPlus,
  Edit2,
  Trash2,
  Star,
  StarOff,
  Tag as TagIcon,
  ExternalLink,
  Download,
  MessageSquare,
  FileCode,
  Braces,
  FolderInput,
  Palette,
  Settings,
  TextCursorInput,
  Pin,
  PinOff,
} from 'lucide-react';
import { modal } from '@/shared/lib/modal';
import { UIcon } from '@/shared/components/ui/icon';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { navigateToGem, navigateToNotebook } from '@/shared/lib/navigation';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { GemPickerContent } from '../../../gems/components/GemPickerContent';
import { NotebookPickerContent } from '../../../notebooks/components/NotebookPickerContent';
import { useExplorerContext } from '../../ExplorerContext';
import type { Gem, Notebook } from '@/shared/types/db';
import { MoveItemsDialog } from '../batch/MoveItemsDialog';
import { detectPlatform, Platform, PLATFORM_CONFIG } from '@/shared/types/platform';
import { ColorPickerGrid } from '@/entrypoints/overlay.content/shared/components/ColorPickerGrid';
import obsidianIcon from '@/assets/icons/obsidian.svg';
import notionIcon from '@/assets/icons/notion.svg';
import { useExport } from '@/entrypoints/overlay.content/shared/features/export/useExport';
import type { ExportFormat } from '@/entrypoints/overlay.content/shared/features/export/types';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../../components/folder-tree/types';

interface UseExplorerMenuItemsParams {
  node: NodeRendererProps<FolderTreeNodeData>['node'];
  isFavorite: boolean;
  folderColor: string | null;
  isPinned: boolean;
  isInbox?: boolean;
  onDelete: () => void;
  onTagToggle: (tagId: string, checked: boolean) => void;
  onColorChange: (color: string | null) => void;
  onCreateFolder: (parentId: string) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
  onFolderSettings?: () => void;
}

export function useExplorerMenuItems({
  node,
  isFavorite,
  folderColor,
  isPinned,
  isInbox,
  onDelete,
  onTagToggle,
  onColorChange,
  onCreateFolder,
  onToggleFavorite,
  onTogglePin,
  onFolderSettings,
}: UseExplorerMenuItemsParams): MenuEntryDef[] {
  const { t } = useI18n();
  const { tags, conversationTags } = useAppStore();
  const { exportItem } = useExport({ obsidianFolder: 'Conversations' });
  const { createPendingAndFocus } = useExplorerContext();
  const lastSelectedGemId = useSettingsStore((s) => s.lastSelectedGemId);
  const lastSelectedNotebookId = useSettingsStore((s) => s.lastSelectedNotebookId);

  /**
   * Resolve an anchor rect for the popover picker.
   * Must be read synchronously before the menu unmounts.
   */
  const getAnchorRect = (e?: React.MouseEvent): DOMRect => {
    const el = e?.currentTarget as HTMLElement | undefined;
    if (el?.getBoundingClientRect) return el.getBoundingClientRect();
    return new DOMRect(window.innerWidth / 2 - 140, window.innerHeight / 3, 280, 0);
  };

  /** Open the gem picker, then start a new chat inside this folder */
  const handleNewGemChatInFolder = async (e?: React.MouseEvent) => {
    const anchorRect = getAnchorRect(e);
    const gem = await usePopoverPickerStore.getState().open<Gem>({
      anchorRect,
      content: <GemPickerContent lastSelectedGemId={lastSelectedGemId} />,
      width: 280,
    });
    if (!gem) return;
    createPendingAndFocus?.(node.data.id);
    navigateToGem(gem.id);
  };

  /** Open the notebook picker, then start a new chat inside this folder */
  const handleNewNotebookChatInFolder = async (e?: React.MouseEvent) => {
    const anchorRect = getAnchorRect(e);
    const notebook = await usePopoverPickerStore.getState().open<Notebook>({
      anchorRect,
      content: <NotebookPickerContent lastSelectedNotebookId={lastSelectedNotebookId} />,
      width: 280,
    });
    if (!notebook) return;
    createPendingAndFocus?.(node.data.id);
    navigateToNotebook(notebook.id);
  };

  const isFile = node.data.type === 'file';

  /**
   * Unified export handler: fetches messages, builds ExportItem (with tags), delegates to exportItem.
   */
  const handleExport = async (format: ExportFormat) => {
    const conversationId = node.data.id;
    const messages = await fetchMessagesForExport(conversationId);
    if (!messages?.length) {
      toast.error(
        t('toast.noContentToExport', {
          platform: PLATFORM_CONFIG[detectPlatform()].name,
        }),
      );
      return;
    }
    const md = buildExportMarkdown(messages);
    const title = node.data.name || conversationId;
    // Get tags for this conversation
    const tagIds = conversationTags
      .filter(ct => ct.conversation_id === conversationId)
      .map(ct => ct.tag_id);
    const itemTags = tagIds.length > 0
      ? tags.filter(tag => tagIds.includes(tag.id)).map(tag => tag.name)
      : undefined;

    exportItem(
      {
        id: conversationId,
        title,
        content: md,
        tags: itemTags,
        description: node.data.data?.description || undefined,
      },
      format,
    );
  };

  const handleMove = async () => {
    let targetFolderId: string | null = null;

    // For folders, exclude the folder itself and all its descendants
    // to prevent circular moves
    let excludeIds = [node.data.id];
    if (node.data.type === 'folder') {
      const { folders } = useAppStore.getState();
      const getDescendantIds = (parentId: string): string[] => {
        const children = folders.filter((f) => f.parent_id === parentId);
        return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
      };
      excludeIds = [node.data.id, ...getDescendantIds(node.data.id)];
    }

    const confirmed = await modal.confirm({
      title: t('batch.moveTitle'),
      content: (
        <MoveItemsDialog
          selectedIds={excludeIds}
          onSelect={(id) => (targetFolderId = id)}
        />
      ),
      modalClassName: 'max-w-xl',
      confirmText: t('common.move'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      await useAppStore
        .getState()
        .moveItem(node.data.id, targetFolderId, node.data.type);
      if (targetFolderId && node.isSelected) {
        node.tree.open(targetFolderId);
        setTimeout(() => {
          node.select();
        }, 100);
      }
    }
  };

  const handleEditDescription = async () => {
    const currentDescription = node.data.data?.description || '';
    let inputValue = currentDescription;
    const confirmed = await modal.confirm({
      title: t('node.editDescription'),
      content: (
        <textarea
          className="w-full min-h-[80px] p-2 rounded-md border border-border/60 bg-background text-sm resize-y"
          defaultValue={currentDescription}
          placeholder={t('node.descriptionPlaceholder')}
          onChange={(e) => { inputValue = e.target.value; }}
          autoFocus
        />
      ),
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await useAppStore
        .getState()
        .updateConversationDescription(node.data.id, inputValue);
    }
  };

  const items: MenuEntryDef[] = [];

  // Folder-specific items
  if (node.data.type === 'folder') {
    // — New chat with Gem / Notebook (picker) — Gemini only, these concepts
    // don't exist on AI Studio.
    if (detectPlatform() === Platform.GEMINI) {
      items.push({
        type: 'item',
        key: 'new-gem-chat',
        icon: <UIcon icon="tabler:diamond" className="h-4 w-4" />,
        label: t('newChatButton.newGemChat'),
        onClick: (e) => {
          e?.stopPropagation();
          void handleNewGemChatInFolder(e);
        },
      });
      items.push({
        type: 'item',
        key: 'new-notebook-chat',
        icon: <UIcon icon="tabler:notebook" className="h-4 w-4" />,
        label: t('newChatButton.newNotebookChat'),
        onClick: (e) => {
          e?.stopPropagation();
          void handleNewNotebookChatInFolder(e);
        },
      });
      items.push({ type: 'separator', key: 'sep-folder-new-chat' });
    }
    items.push({
      type: 'item',
      key: 'new-folder',
      icon: <FolderPlus className="h-4 w-4" />,
      label: t('node.newFolder'),
      onClick: (e) => {
        e?.stopPropagation();
        onCreateFolder(node.data.id);
      },
    });
    items.push({
      type: 'item',
      key: 'toggle-pin',
      icon: isPinned
        ? <PinOff className="h-4 w-4" />
        : <Pin className="h-4 w-4 rotate-45" />,
      label: isPinned ? t('node.unpinFromTop') : t('node.pinToTop'),
      onClick: () => onTogglePin(node.data.id, isPinned),
    });
    if (!isInbox) {
      items.push({
        type: 'item',
        key: 'move-to',
        icon: <FolderInput className="h-4 w-4" />,
        label: t('node.moveTo'),
        onClick: () => void handleMove(),
      });
    }
    items.push({ type: 'separator', key: 'sep-folder-top' });
  }

  // File-specific items
  if (isFile) {
    // — Organize —
    items.push({
      type: 'item',
      key: 'toggle-favorite',
      icon: isFavorite
        ? <StarOff className="h-4 w-4" />
        : <Star className="h-4 w-4" />,
      label: isFavorite ? t('node.removeFromFavorites') : t('node.addToFavorites'),
      onClick: () => onToggleFavorite(node.data.id, isFavorite),
    });

    items.push({
      type: 'item',
      key: 'move-to',
      icon: <FolderInput className="h-4 w-4" />,
      label: t('node.moveTo'),
      onClick: () => void handleMove(),
    });

    // Tags submenu
    items.push({
      type: 'sub',
      key: 'tags',
      icon: <TagIcon className="h-4 w-4" />,
      label: t('node.tags'),
      contentClassName: 'w-48 max-h-64 overflow-y-auto',
      children: tags.length === 0
        ? [{ type: 'item' as const, key: 'no-tags', label: t('node.noTagsCreated'), onClick: () => {} }]
        : tags.map((tag) => {
            const hasTag = conversationTags.some(
              (ct) => ct.conversation_id === node.data.id && ct.tag_id === tag.id,
            );
            return {
              type: 'checkbox' as const,
              key: `tag-${tag.id}`,
              checked: hasTag,
              onCheckedChange: (checked: boolean) => onTagToggle(tag.id, checked),
              preventClose: true,
              label: (
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                  />
                  {tag.name}
                </div>
              ),
            };
          }),
    });

    items.push({ type: 'separator', key: 'sep-organize' });

    // — Manage —
    items.push({
      type: 'item',
      key: 'rename',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('node.rename'),
      onClick: () => node.edit(),
    });

    items.push({
      type: 'item',
      key: 'edit-description',
      icon: <TextCursorInput className="h-4 w-4" />,
      label: t('node.editDescription'),
      onClick: () => void handleEditDescription(),
    });

    // Export submenu
    items.push({
      type: 'sub',
      key: 'export',
      icon: <Download className="h-4 w-4" />,
      label: t('node.export'),
      contentClassName: 'w-48',
      children: [
        {
          type: 'item' as const,
          key: 'export-text',
          icon: <MessageSquare className="h-4 w-4" />,
          label: t('node.exportAsText'),
          onClick: () => void handleExport('text'),
        },
        {
          type: 'item' as const,
          key: 'export-md',
          icon: <FileCode className="h-4 w-4" />,
          label: t('node.exportAsMarkdown'),
          onClick: () => void handleExport('markdown'),
        },
        {
          type: 'item' as const,
          key: 'export-json',
          icon: <Braces className="h-4 w-4" />,
          label: t('node.exportAsJson'),
          onClick: () => void handleExport('json'),
        },
        { type: 'separator' as const, key: 'sep-export-apps' },
        {
          type: 'item' as const,
          key: 'export-obsidian',
          icon: <img src={obsidianIcon} alt="Obsidian" className="h-4 w-4" />,
          label: t('export.exportToObsidian'),
          onClick: () => void handleExport('obsidian'),
        },
        {
          type: 'item' as const,
          key: 'export-notion',
          icon: <img src={notionIcon} alt="Notion" className="h-4 w-4" />,
          label: t('export.exportToNotion'),
          onClick: () => void handleExport('notion'),
        },
      ],
    });

    items.push({ type: 'separator', key: 'sep-file-bottom' });
  }

  // Folder-specific: organize + manage
  if (node.data.type === 'folder') {
    // — Organize —
    // Color submenu
    items.push({
      type: 'sub',
      key: 'change-color',
      icon: <Palette className="h-4 w-4" />,
      label: t('node.changeColor'),
      contentClassName: 'w-auto p-2',
      children: (
        <ColorPickerGrid
          selectedColor={folderColor}
          onColorChange={onColorChange}
          allowCustom
        />
      ),
    });

    items.push({ type: 'separator', key: 'sep-folder-organize' });

    // — Manage — (hide rename for inbox)
    if (!isInbox) {
      items.push({
        type: 'item',
        key: 'rename',
        icon: <Edit2 className="h-4 w-4" />,
        label: t('node.rename'),
        onClick: () => node.edit(),
      });
    }

    if (onFolderSettings) {
      items.push({
        type: 'item',
        key: 'folder-settings',
        icon: <Settings className="h-4 w-4" />,
        label: t('folderSettings.title'),
        onClick: () => onFolderSettings(),
      });
    }

    if (!isInbox) {
      items.push({ type: 'separator', key: 'sep-folder-manage' });
    }
  }

  // Open in new tab (above delete, file-only)
  if (isFile) {
    items.push({
      type: 'item',
      key: 'open-new-tab',
      icon: <ExternalLink className="h-4 w-4" />,
      label: t('node.openInNewTab'),
      onClick: () => {
        const url = node.data.data.external_url;
        if (url) window.open(url, '_blank');
      },
    });
    items.push({ type: 'separator', key: 'sep-before-delete' });
  }

  // Delete (always last, but not for inbox folder)
  if (!isInbox) {
    items.push({
      type: 'item',
      key: 'delete',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('node.delete'),
      className: 'text-destructive focus:text-destructive',
      onClick: onDelete,
    });
  }

  return items;
}
