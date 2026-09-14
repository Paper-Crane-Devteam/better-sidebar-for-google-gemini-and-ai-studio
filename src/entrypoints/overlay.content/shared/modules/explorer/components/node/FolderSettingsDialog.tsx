import React, { useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { ColorPickerGrid } from '@/entrypoints/overlay.content/shared/components/ColorPickerGrid';
import { FolderDefaultTargetsSection } from './FolderDefaultTargetsSection';

interface FolderSettingsDialogProps {
  folderId: string;
  initialName: string;
  initialColor: string | null;
  onSave: (name: string, color: string | null) => void;
  nameDisabled?: boolean;
}

export const FolderSettingsDialog = ({
  folderId,
  initialName,
  initialColor,
  onSave,
  nameDisabled,
}: FolderSettingsDialogProps) => {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor);

  // Expose save via ref-like pattern: parent reads via callback
  // We use a MutationObserver-free approach: the parent modal's onConfirm will call onSave
  React.useEffect(() => {
    // Update parent's reference on each change
    onSave(name, color);
  }, [name, color]);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Folder Name */}
      {!nameDisabled && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {t('folderSettings.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
        </div>
      )}

      {/* Color Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          {t('folderSettings.color')}
        </label>

        <ColorPickerGrid
          size="lg"
          selectedColor={color}
          onColorChange={setColor}
          allowCustom
          inlineCustom
        />
      </div>

      {/* Gems / Notebooks that default into this folder — saved immediately */}
      <FolderDefaultTargetsSection folderId={folderId} />
    </div>
  );
};
