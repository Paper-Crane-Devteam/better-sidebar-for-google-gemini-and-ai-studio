import React from 'react';
import { NodeProps } from './types';
import { Star } from 'lucide-react';
import { FolderTreeNodeContent } from '../../../../components/folder-tree';

interface NodeContentProps extends NodeProps {
  isBatchMode: boolean;
  isBatchSelected: boolean;
  isBatchIndeterminate?: boolean;
  onToggleBatchSelection: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  folderIcon: React.ReactNode;
  fileIcon: React.ReactNode;
  toggleIcon: React.ReactNode;
  handleToggle: (e: React.MouseEvent) => void;
  folderColor?: string | null;
  newName: string;
  setNewName: (name: string) => void;
}

export const NodeContent = ({
  node,
  isBatchMode,
  isBatchSelected,
  isBatchIndeterminate,
  onToggleBatchSelection,
  isFavorite,
  onToggleFavorite,
  folderIcon,
  fileIcon,
  toggleIcon,
  handleToggle,
  folderColor,
  newName,
  setNewName,
}: NodeContentProps) => {
  return (
    <FolderTreeNodeContent
      node={node}
      folderIcon={folderIcon}
      fileIcon={null}
      toggleIcon={toggleIcon}
      handleToggle={handleToggle}
      folderColor={folderColor}
      batchMode={
        isBatchMode
          ? {
              enabled: true,
              selected: isBatchSelected,
              indeterminate: isBatchIndeterminate,
              onToggle: onToggleBatchSelection,
            }
          : undefined
      }
      newName={newName}
      setNewName={setNewName}
      nameAddon={
        isFavorite ? (
          <div
            role="button"
            className="h-5 w-5 shrink-0 flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
            onClick={onToggleFavorite}
          >
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          </div>
        ) : undefined
      }
    />
  );
};
