import React from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import {
  fetchMessagesForExport,
  buildExportText,
  buildExportMarkdown,
  buildExportJson,
  downloadBlob,
  safeFilename,
} from '../../lib/exportConversation';
import { FolderPlus, Edit2, Trash2, Star, StarOff, Tag as TagIcon, ExternalLink, Download, MessageSquare, FileCode, Braces, FolderInput } from 'lucide-react';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from '../batch/MoveItemsDialog';
import { NodeProps } from './types';
import { detectPlatform, PLATFORM_CONFIG } from '@/shared/types/platform';

interface NodeContextMenuProps extends NodeProps {
  isFavorite: boolean;
  onDelete: () => void;
  onTagToggle: (tagId: string, checked: boolean) => void;
  // Make sure these match what Node passes
  onCreateFolder: (parentId: string) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
}

export const NodeContextMenu = ({
  node,
  onCreateFolder,
  onToggleFavorite,
  onDelete,
  onTagToggle,
  isFavorite,
}: NodeContextMenuProps) => {
  const { t } = useI18n();
  const { tags, conversationTags } = useAppStore();
  const { explorer } = useSettingsStore();
  const { enableRightClickRename } = explorer;
  const shouldPreventRef = React.useRef(false);
  const [isTagSubMenuOpen, setIsTagSubMenuOpen] = React.useState(false);
  const [isExportSubMenuOpen, setIsExportSubMenuOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const exportCloseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const isFile = node.data.type === 'file';

  const handleSubMenuMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsTagSubMenuOpen(true);
  };

  const handleSubMenuMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsTagSubMenuOpen(false);
    }, 150);
  };

  const handleExportSubMenuMouseEnter = () => {
    if (exportCloseTimeoutRef.current) {
      clearTimeout(exportCloseTimeoutRef.current);
      exportCloseTimeoutRef.current = null;
    }
    setIsExportSubMenuOpen(true);
  };

  const handleExportSubMenuMouseLeave = () => {
    exportCloseTimeoutRef.current = setTimeout(() => {
      setIsExportSubMenuOpen(false);
    }, 150);
  };

  const handleExportAs = async (
    format: 'text' | 'markdown' | 'json'
  ) => {
    const conversationId = node.data.id;
    const messages = await fetchMessagesForExport(conversationId);
    if (!messages?.length) {
      toast.error(t('toast.noContentToExport', { platform: PLATFORM_CONFIG[detectPlatform()].name }));
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
      await useAppStore.getState().moveItem(node.data.id, targetFolderId, node.data.type);
      if (targetFolderId && node.isSelected) {
        node.tree.open(targetFolderId);
        setTimeout(() => {
          node.select();
        }, 100);
      }
    }
  };

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (exportCloseTimeoutRef.current) clearTimeout(exportCloseTimeoutRef.current);
    };
  }, []);

  return (
    <ContextMenuContent
      className="w-48"
      onCloseAutoFocus={(e) => {
        if (shouldPreventRef.current) {
          e.preventDefault();
          shouldPreventRef.current = false;
        }
      }}
    >
      {node.data.type === 'folder' && (
        <>
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(node.data.id);
            }}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            {t('node.newFolder')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {isFile && (
        <>
          <ContextMenuItem
            onClick={() => {
              const url = node.data.data.external_url;
              if (url) {
                window.open(url, '_blank');
              }
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('node.openInNewTab')}
          </ContextMenuItem>

          <ContextMenuItem
            onClick={() => onToggleFavorite(node.data.id, isFavorite)}
          >
            {isFavorite ? (
              <>
                <StarOff className="mr-2 h-4 w-4" />
                {t('node.removeFromFavorites')}
              </>
            ) : (
              <>
                <Star className="mr-2 h-4 w-4" />
                {t('node.addToFavorites')}
              </>
            )}
          </ContextMenuItem>

          <ContextMenuItem onClick={handleMove}>
            <FolderInput className="mr-2 h-4 w-4" />
            {t('node.moveTo')}
          </ContextMenuItem>

          <ContextMenuSub
            open={isTagSubMenuOpen}
            onOpenChange={setIsTagSubMenuOpen}
          >
            <ContextMenuSubTrigger
              onMouseEnter={handleSubMenuMouseEnter}
              onMouseLeave={handleSubMenuMouseLeave}
            >
              <TagIcon className="mr-2 h-4 w-4" />
              {t('node.tags')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              className="w-48 max-h-64 overflow-y-auto"
              onMouseEnter={handleSubMenuMouseEnter}
              onMouseLeave={handleSubMenuMouseLeave}
            >
              {tags.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  {t('node.noTagsCreated')}
                </div>
              ) : (
                tags.map((tag) => {
                  const hasTag = conversationTags.some(
                    (ct) =>
                      ct.conversation_id === node.data.id &&
                      ct.tag_id === tag.id
                  );
                  return (
                    <ContextMenuCheckboxItem
                      key={tag.id}
                      checked={hasTag}
                      onCheckedChange={(checked) =>
                        onTagToggle(tag.id, checked)
                      }
                      onSelect={(e) => {
                        e.preventDefault();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {tag.color && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.name}
                      </div>
                    </ContextMenuCheckboxItem>
                  );
                })
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub
            open={isExportSubMenuOpen}
            onOpenChange={setIsExportSubMenuOpen}
          >
            <ContextMenuSubTrigger
              onMouseEnter={handleExportSubMenuMouseEnter}
              onMouseLeave={handleExportSubMenuMouseLeave}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('node.export')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              className="w-48"
              onMouseEnter={handleExportSubMenuMouseEnter}
              onMouseLeave={handleExportSubMenuMouseLeave}
            >
              <ContextMenuItem onSelect={() => void handleExportAs('text')}>
                <MessageSquare className="mr-2 h-4 w-4" />
                {t('node.exportAsText')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void handleExportAs('markdown')}>
                <FileCode className="mr-2 h-4 w-4" />
                {t('node.exportAsMarkdown')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void handleExportAs('json')}>
                <Braces className="mr-2 h-4 w-4" />
                {t('node.exportAsJson')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />
        </>
      )}
      {(node.data.type === 'folder') && (
        <ContextMenuItem
          onClick={() => {
            shouldPreventRef.current = true;
            // Delay to allow context menu to close and focus to settle
            // Prevents the input from immediately losing focus (blurring)
            node.edit();
          }}
        >
          <Edit2 className="mr-2 h-4 w-4" />
          {t('node.rename')}
        </ContextMenuItem>
      )}
      <ContextMenuItem
        onClick={onDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {t('node.delete')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
};
