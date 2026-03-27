import React, { useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { FOLDER_COLOR_PRESETS } from '@/shared/lib/folder-colors';
import { Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';

import { SimpleTooltip } from '@/shared/components/ui/tooltip';

interface FolderSettingsDialogProps {
  initialName: string;
  initialColor: string | null;
  onSave: (name: string, color: string | null) => void;
}

export const FolderSettingsDialog = ({
  initialName,
  initialColor,
  onSave,
}: FolderSettingsDialogProps) => {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor);
  const [customColor, setCustomColor] = useState<string>(
    initialColor || '#6366F1',
  );

  // Expose save via ref-like pattern: parent reads via callback
  // We use a MutationObserver-free approach: the parent modal's onConfirm will call onSave
  React.useEffect(() => {
    // Update parent's reference on each change
    onSave(name, color);
  }, [name, color]);

  const isPresetColor = FOLDER_COLOR_PRESETS.some((p) => p.value === color);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Folder Name */}
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

      {/* Color Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          {t('folderSettings.color')}
        </label>

        {/* Preset Colors Grid */}
        <div className="flex flex-wrap gap-2">
          {/* Default (no color) */}
          <SimpleTooltip content={t('folderSettings.defaultColor')}>
            <button
              type="button"
              className={cn(
                'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all',
                color === null
                  ? 'border-primary scale-110'
                  : 'border-border hover:border-muted-foreground/50 hover:scale-105',
              )}
              onClick={() => setColor(null)}
            >
              {color === null && (
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          </SimpleTooltip>

          {FOLDER_COLOR_PRESETS.map((preset) => (
            <SimpleTooltip key={preset.value} content={t(preset.labelKey)}>
              <button
                type="button"
                className={cn(
                  'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all',
                  color === preset.value
                    ? 'border-primary scale-110'
                    : 'border-transparent hover:scale-105',
                )}
                style={{ backgroundColor: preset.value }}
                onClick={() => setColor(preset.value)}
              >
                {color === preset.value && (
                  <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                )}
              </button>
            </SimpleTooltip>
          ))}
        </div>

        {/* Custom Color Picker */}
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-muted-foreground">
            {t('folderSettings.customColor')}
          </label>
          <div className="relative">
            <input
              type="color"
              value={
                isPresetColor || color === null
                  ? customColor
                  : color || customColor
              }
              onChange={(e) => {
                setCustomColor(e.target.value);
                setColor(e.target.value);
              }}
              className="w-7 h-7 rounded-md border border-border cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
            />
          </div>
          {color && !isPresetColor && (
            <span className="text-xs text-muted-foreground font-mono">
              {color}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
