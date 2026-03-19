import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { FolderPicker } from '@/shared/components/FolderPicker';

interface MoveItemsDialogProps {
  onSelect: (folderId: string | null) => void;
  selectedIds: string[];
}

export const MoveItemsDialog = ({ onSelect, selectedIds }: MoveItemsDialogProps) => {
  const folders = useAppStore((state) => state.promptFolders);
  return (
    <FolderPicker
      folders={folders}
      onSelect={onSelect}
      selectedIds={selectedIds}
    />
  );
};
