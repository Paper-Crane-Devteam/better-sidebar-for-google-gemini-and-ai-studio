import React from 'react';
import { Star } from 'lucide-react';
import { NodeProps } from './types';
import { FolderTreeNodeContent } from '../../../../components/folder-tree';
import { PromptIconDisplay } from '../../lib/prompt-icons';

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
  newName,
  setNewName,
}: NodeContentProps) => {
  const isFile = node.data.type === 'file';

  let displayFileIcon = fileIcon;
  if (isFile && node.data.data?.icon) {
    displayFileIcon = (
      <PromptIconDisplay
        name={node.data.data.icon}
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
    );
  }

  return (
    <FolderTreeNodeContent
      node={node}
      folderIcon={folderIcon}
      fileIcon={displayFileIcon}
      toggleIcon={toggleIcon}
      handleToggle={handleToggle}
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
    />
  );
};
