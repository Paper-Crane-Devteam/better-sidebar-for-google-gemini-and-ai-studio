import React from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import {
  fetchMessagesForExport,
  buildExportText,
  buildExportMarkdown,
  buildExportJson,
  downloadBlob,
  safeFilename,
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
  Check,
  Settings,
} from 'lucide-react';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from '../batch/MoveItemsDialog';
import { detectPlatform, PLATFORM_CONFIG } from '@/shared/types/platform';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { FOLDER_COLOR_PRESETS } from '@/shared/lib/folder-colors';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../../components/folder-tree/types';

interface UseExplorerMenuItemsParams {
  node: NodeRendererProps<FolderTreeNodeData>['node'];
  isFavorite: boolean;
  folderColor: string | null;
  onDelete: () => void;
  onTagToggle: (tagId: string, checked: boolean) => void;
  onColorChange: (color: string | null) => void;
  onCreateFolder: (parentId: string) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  onFolderSettings?: () => void;
}

export function useExplorerMenuItems({
  node,
  isFavorite,
  folderColor,
  onDelete,
  onTagToggle,
  onColorChange,
  onCreateFolder,
  onToggleFavorite,
  onFolderSettings,
}: UseExplorerMenuItemsParams): MenuEntryDef[] {
  const { t } = useI18n();
  const { tags, conversationTags } = useAppStore();

  const isFile = node.data.type === 'file';

  const handleExportAs = async (format: 'text' | 'markdown' | 'json') => {
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
    const baseName = safeFilename(node.data.name || conversationId);
    if (format === 'text') {
      const text = buildExportText(messages);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${baseName}.txt`);
    } else if (format === 'markdown') {
      const md = buildExportMarkdown(messages);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `${baseName}.md`);
    } else {
      const json = buildExportJson(messages);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, `${baseName}.json`);
    }
  };

  const handleMove = async () => {
    let targetFolderId: string | null = null;
    const confirmed = await modal.confirm({
      title: t('batch.moveTitle'),
      content: (
        <MoveItemsDialog
          selectedIds={[node.data.id]}
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

  const items: MenuEntryDef[] = [];

  // Folder-specific items
  if (node.data.type === 'folder') {
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
    items.push({ type: 'separator', key: 'sep-folder-top' });
  }

  // File-specific items
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
          onClick: () => void handleExportAs('text'),
        },
        {
          type: 'item' as const,
          key: 'export-md',
          icon: <FileCode className="h-4 w-4" />,
          label: t('node.exportAsMarkdown'),
          onClick: () => void handleExportAs('markdown'),
        },
        {
          type: 'item' as const,
          key: 'export-json',
          icon: <Braces className="h-4 w-4" />,
          label: t('node.exportAsJson'),
          onClick: () => void handleExportAs('json'),
        },
      ],
    });

    // Rename
    items.push({
      type: 'item',
      key: 'rename',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('node.rename'),
      onClick: () => node.edit(),
    });

    items.push({ type: 'separator', key: 'sep-file-bottom' });
  }

  // Folder: settings + rename + color
  if (node.data.type === 'folder') {
    if (onFolderSettings) {
      items.push({
        type: 'item',
        key: 'folder-settings',
        icon: <Settings className="h-4 w-4" />,
        label: t('folderSettings.title'),
        onClick: () => onFolderSettings(),
      });
    }

    items.push({
      type: 'item',
      key: 'rename',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('node.rename'),
      onClick: () => node.edit(),
    });

    // Color submenu
    items.push({
      type: 'sub',
      key: 'change-color',
      icon: <Palette className="h-4 w-4" />,
      label: t('node.changeColor'),
      contentClassName: 'w-auto p-2',
      children: (
        <div className="flex flex-wrap gap-1.5 max-w-[180px]">
          <SimpleTooltip content={t('folderSettings.defaultColor')}>
            <button
              type="button"
              className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center hover:scale-110 transition-transform"
              onClick={() => onColorChange(null)}
            >
              {folderColor === null && (
                <Check className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
          </SimpleTooltip>
          {FOLDER_COLOR_PRESETS.map((preset) => (
            <SimpleTooltip key={preset.value} content={t(preset.labelKey)}>
              <button
                type="button"
                className="w-6 h-6 rounded-full border-2 border-transparent flex items-center justify-center hover:scale-110 transition-transform"
                style={{ backgroundColor: preset.value }}
                onClick={() => onColorChange(preset.value)}
              >
                {folderColor === preset.value && (
                  <Check className="w-3 h-3 text-white drop-shadow-sm" />
                )}
              </button>
            </SimpleTooltip>
          ))}
        </div>
      ),
    });
  }

  // Delete (always last)
  items.push({
    type: 'item',
    key: 'delete',
    icon: <Trash2 className="h-4 w-4" />,
    label: t('node.delete'),
    className: 'text-destructive focus:text-destructive',
    onClick: onDelete,
  });

  return items;
}
