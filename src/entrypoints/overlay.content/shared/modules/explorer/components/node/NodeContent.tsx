import React from 'react';
import { Star } from 'lucide-react';
import { NodeProps } from './types';
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
  hoverRef?: React.RefObject<HTMLElement | null>;
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
  hoverRef,
}: NodeContentProps) => {
  return (
    <FolderTreeNodeContent
      node={node}
      folderIcon={folderIcon}
      fileIcon={null}
      toggleIcon={toggleIcon}
      handleToggle={handleToggle}
      folderColor={folderColor}
      hoverRef={hoverRef}
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
      namePrefix={isFavorite ? <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" /> : undefined}
      nameAddon={undefined}
    />
  );
};
