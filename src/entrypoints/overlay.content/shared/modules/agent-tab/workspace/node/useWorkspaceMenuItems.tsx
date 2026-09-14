/**
 * The actions available on one workspace entry.
 *
 * Shared between the row's three-dot menu and its right-click menu, which are two
 * presentations of the same list — defining it once is what keeps them from drifting.
 * The same arrangement snippets uses.
 *
 * Ordering follows what a file manager does: reading first, then creating, then the
 * structural operations, with delete last and separated. Folder and file share only
 * rename and delete; everything else is specific to one, so the two branches are written
 * out rather than folded together behind conditionals.
 */

import React from 'react';
import {
  ClipboardCopy,
  Download,
  Edit,
  Eye,
  FileArchive,
  FilePlus,
  FolderPlus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import type {
  FolderTreeNodeData,
  NodeApi,
} from '../../../../components/folder-tree/types';
import type { MenuEntryDef } from '../../../../components/node-action-bar';
import type { WorkspaceNodeData } from '../useWorkspaceFiles';

export interface WorkspaceMenuHandlers {
  onOpen: (path: string) => void;
  onCopyContent: (path: string) => void;
  onDownload: (path: string) => void;
  onDownloadZip: (path: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onUploadTo: (parentPath: string) => void;
  onDelete: (path: string) => void;
}

export function useWorkspaceMenuItems(
  node: NodeApi<FolderTreeNodeData>,
  handlers: WorkspaceMenuHandlers,
): MenuEntryDef[] {
  const { t } = useI18n();
  const entry = node.data.data as WorkspaceNodeData;
  const isFile = node.data.type === 'file';
  const path = entry.path;

  const items: MenuEntryDef[] = [];

  if (isFile) {
    items.push({
      type: 'item',
      key: 'open',
      icon: <Eye className="h-4 w-4" />,
      label: t('agent.workspace.open', { defaultValue: 'Open' }),
      onClick: () => handlers.onOpen(path),
    });

    // Copying bytes to the clipboard as text would paste replacement characters, so the
    // action is simply absent for a binary file rather than present and misleading.
    if (!entry.isBinary) {
      items.push({
        type: 'item',
        key: 'copy',
        icon: <ClipboardCopy className="h-4 w-4" />,
        label: t('agent.workspace.copyContent', { defaultValue: 'Copy content' }),
        onClick: () => handlers.onCopyContent(path),
      });
    }

    items.push({
      type: 'item',
      key: 'download',
      icon: <Download className="h-4 w-4" />,
      label: t('common.download', { defaultValue: 'Download' }),
      onClick: () => handlers.onDownload(path),
    });
  } else {
    items.push({
      type: 'item',
      key: 'new-folder',
      icon: <FolderPlus className="h-4 w-4" />,
      label: t('agent.workspace.newFolder', { defaultValue: 'New folder' }),
      onClick: () => handlers.onCreateFolder(path),
    });
    items.push({
      type: 'item',
      key: 'new-file',
      icon: <FilePlus className="h-4 w-4" />,
      label: t('agent.workspace.newFile', { defaultValue: 'New file' }),
      onClick: () => handlers.onCreateFile(path),
    });
    items.push({
      type: 'item',
      key: 'import',
      icon: <Upload className="h-4 w-4" />,
      label: t('agent.workspace.importHere', { defaultValue: 'Import files here…' }),
      onClick: () => handlers.onUploadTo(path),
    });
    items.push({ type: 'separator', key: 'sep-create' });
    items.push({
      type: 'item',
      key: 'download-zip',
      icon: <FileArchive className="h-4 w-4" />,
      label: t('agent.workspace.downloadZip', { defaultValue: 'Download as ZIP' }),
      onClick: () => handlers.onDownloadZip(path),
    });
  }

  items.push({ type: 'separator', key: 'sep-rename' });

  items.push({
    type: 'item',
    key: 'rename',
    icon: <Edit className="h-4 w-4" />,
    label: t('common.rename', { defaultValue: 'Rename' }),
    onClick: () => node.edit(),
  });

  items.push({
    type: 'item',
    key: 'delete',
    icon: <Trash2 className="h-4 w-4" />,
    label: t('common.delete', { defaultValue: 'Delete' }),
    onClick: () => handlers.onDelete(path),
    className: 'text-destructive',
  });

  return items;
}
