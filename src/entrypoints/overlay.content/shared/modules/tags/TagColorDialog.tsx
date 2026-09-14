import React, { useState } from 'react';
import { ColorPickerGrid } from '../../components/ColorPickerGrid';

interface TagColorDialogProps {
  initialColor: string | null;
  onColorChange: (color: string | null) => void;
}

/**
 * Tag color picker dialog content, used inside modal.confirm().
 * Follows the same pattern as FolderSettingsDialog.
 */
export const TagColorDialog = ({
  initialColor,
  onColorChange,
}: TagColorDialogProps) => {
  const [color, setColor] = useState<string | null>(initialColor);

  // Notify parent on each change (same pattern as FolderSettingsDialog)
  React.useEffect(() => {
    onColorChange(color);
  }, [color]);

  return (
    <div className="flex flex-col gap-2 py-2">
      <ColorPickerGrid
        size="lg"
        selectedColor={color}
        onColorChange={(c) => setColor(c)}
        allowCustom
        inlineCustom
      />
    </div>
  );
};
