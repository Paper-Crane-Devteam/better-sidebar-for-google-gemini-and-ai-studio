import React from 'react';
import { NodeApi } from 'react-arborist';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils/utils';
import { FolderTreeNodeData } from './types';
import { RenameForm } from './RenameForm';
import { BatchSelectionCheckbox } from './BatchSelectionCheckbox';

export interface FolderTreeNodeContentProps {
  node: NodeApi<FolderTreeNodeData>;

  /** Icon for folder nodes */
  folderIcon: React.ReactNode;
  /** Icon for file/leaf nodes (null to hide) */
  fileIcon: React.ReactNode | null;
  /** Toggle chevron icon (null for file nodes) */
  toggleIcon: React.ReactNode;
  /** Handler for clicking the toggle chevron */
  handleToggle: (e: React.MouseEvent) => void;

  /** Optional folder tint color */
  folderColor?: string | null;

  /** Batch selection state (omit to disable) */
  batchMode?: {
    enabled: boolean;
    selected: boolean;
    indeterminate?: boolean;
    onToggle: () => void;
  };

  /** Rename state */
  newName: string;
  setNewName: (name: string) => void;

  /** Content rendered after the name (e.g. favorite star) */
  nameAddon?: React.ReactNode;
}

export const FolderTreeNodeContent = ({
  node,
  folderIcon,
  fileIcon,
  toggleIcon,
  handleToggle,
  folderColor,
  batchMode,
  newName,
  setNewName,
  nameAddon,
}: FolderTreeNodeContentProps) => {
  const isFile = node.data.type === 'file';
  const isTimeGroup = node.data.data?.isTimeGroup;

  return (
    <>
      {batchMode?.enabled && (!isTimeGroup || batchMode.enabled) && (
        <BatchSelectionCheckbox
          checked={batchMode.selected}
          indeterminate={batchMode.indeterminate}
          onChange={batchMode.onToggle}
          className="ml-1"
        />
      )}

      <div
        role="button"
        tabIndex={0}
        className={cn(
          'w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground',
          isFile && batchMode?.enabled && 'hidden',
        )}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e as any);
          }
        }}
      >
        {toggleIcon}
      </div>

      {node.data.type === 'folder' && (
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {folderIcon}
        </div>
      )}

      {isFile && fileIcon && (
        <div className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground">
          {fileIcon}
        </div>
      )}

      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden justify-between">
        {node.isEditing ? (
          <RenameForm node={node} newName={newName} setNewName={setNewName} />
        ) : isFile ? (
          <SimpleTooltip content={node.data.name}>
            <span className="truncate text-sm select-none">
              {node.data.name}
            </span>
          </SimpleTooltip>
        ) : (
          <span
            className="truncate text-sm select-none"
            style={folderColor ? { color: folderColor } : undefined}
          >
            {node.data.name}
          </span>
        )}
        {nameAddon}
      </div>
    </>
  );
};
