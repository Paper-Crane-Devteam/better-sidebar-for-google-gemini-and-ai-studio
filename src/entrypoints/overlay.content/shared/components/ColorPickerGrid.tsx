import React from 'react';
import { Check, Pipette } from 'lucide-react';
import { COLOR_PRESETS } from '@/shared/lib/preset-colors';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils/utils';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { useMenuDismiss } from './node-action-bar/menu-dismiss';
import { CustomColorPicker } from './CustomColorPicker';

interface ColorPickerGridProps {
  selectedColor: string | null;
  onColorChange: (color: string | null) => void;
  className?: string;
  size?: 'sm' | 'lg';
  /**
   * Show a "custom color" swatch after the presets.
   * In a menu it dismisses the menu and opens a standalone picker popover;
   * elsewhere (e.g. a dialog) it expands the picker inline.
   */
  allowCustom?: boolean;
  /** Render the custom picker inline instead of in a popover */
  inlineCustom?: boolean;
}

/**
 * A reusable color picker grid component with preset colors.
 * Used by folders and tags to select a color.
 */
export const ColorPickerGrid = ({
  selectedColor,
  onColorChange,
  className,
  size = 'sm',
  allowCustom,
  inlineCustom,
}: ColorPickerGridProps) => {
  const { t } = useI18n();
  const dismissMenu = useMenuDismiss();
  const [isInlineOpen, setIsInlineOpen] = React.useState(false);

  const buttonClass = size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  const iconClass = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';

  const isPreset = COLOR_PRESETS.some((p) => p.value === selectedColor);
  const isCustom = selectedColor !== null && !isPreset;

  /**
   * Hand the interaction over to the standalone popover.
   *
   * The anchor rect must be read before the menu unmounts, and the menu has to
   * go away first: a native-feeling drag inside a Radix submenu fights its
   * focus/pointer-grace handling, and the submenu would close mid-drag anyway.
   */
  const openCustomPopover = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Read the rect now: the button is gone once the menu unmounts.
    const anchorRect = e.currentTarget.getBoundingClientRect();
    const initialColor = selectedColor;
    dismissMenu();

    // Radix modal menus mark the rest of the document pointer-events:none and
    // aria-hidden while open, and only clean that up on unmount. Waiting a
    // frame keeps the popover out of that teardown.
    requestAnimationFrame(() => {
      void usePopoverPickerStore.getState().open({
        anchorRect,
        content: (
          // GlobalPopoverPicker pads its content with px-6 py-4, which is
          // tuned for list pickers; pull it back so this isn't cramped.
          <div className="-mx-3 -my-2">
            <CustomColorPicker value={initialColor} onChange={onColorChange} />
          </div>
        ),
        width: 232,
      });
    });
  };

  const customSwatch = (
    <SimpleTooltip content={t('folderSettings.customColor')}>
      <button
        type="button"
        aria-label={t('folderSettings.customColor')}
        className={cn(
          buttonClass,
          'rounded-full border-2 flex items-center justify-center hover:scale-110 transition-transform',
          isCustom ? 'border-transparent' : 'border-border',
        )}
        style={
          isCustom
            ? { backgroundColor: selectedColor as string }
            : {
                background:
                  'conic-gradient(#EF4444,#EAB308,#22C55E,#06B6D4,#6366F1,#EC4899,#EF4444)',
              }
        }
        onClick={(e) => {
          if (inlineCustom) setIsInlineOpen((prev) => !prev);
          else openCustomPopover(e);
        }}
      >
        {isCustom ? (
          <Check className={cn(iconClass, 'text-white drop-shadow-sm')} />
        ) : (
          <Pipette className={cn(iconClass, 'text-white drop-shadow-sm')} />
        )}
      </button>
    </SimpleTooltip>
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        size === 'lg' ? 'w-full' : 'max-w-[160px]',
      )}
    >
      <div className={cn('flex flex-wrap gap-2', className)}>
        {/* Default (no color) */}
        <SimpleTooltip content={t('folderSettings.defaultColor')}>
          <button
            type="button"
            className={cn(
              buttonClass,
              'rounded-full border-2 border-border flex items-center justify-center hover:scale-110 transition-transform',
            )}
            onClick={() => onColorChange(null)}
          >
            {selectedColor === null && (
              <Check className={cn(iconClass, 'text-muted-foreground')} />
            )}
          </button>
        </SimpleTooltip>

        {COLOR_PRESETS.map((preset) => (
          <SimpleTooltip key={preset.value} content={t(preset.labelKey)}>
            <button
              type="button"
              className={cn(
                buttonClass,
                'rounded-full border-2 border-transparent flex items-center justify-center hover:scale-110 transition-transform',
              )}
              style={{ backgroundColor: preset.value }}
              onClick={() => onColorChange(preset.value)}
            >
              {selectedColor === preset.value && (
                <Check className={cn(iconClass, 'text-white drop-shadow-sm')} />
              )}
            </button>
          </SimpleTooltip>
        ))}

        {allowCustom && customSwatch}
      </div>

      {allowCustom && inlineCustom && isInlineOpen && (
        <CustomColorPicker value={selectedColor} onChange={onColorChange} />
      )}
    </div>
  );
};
