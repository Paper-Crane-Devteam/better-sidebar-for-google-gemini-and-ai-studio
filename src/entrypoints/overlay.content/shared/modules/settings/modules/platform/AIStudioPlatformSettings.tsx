import React, { useState, useEffect, useMemo } from 'react';
import { Separator } from '../../../../components/ui/separator';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { debounce } from 'lodash';

/**
 * AI Studio platform-specific settings.
 * Mirrors the AIStudioUIControl dropdown but rendered inside the settings modal.
 * All state is synced via the same stores (enhancedFeatures.aistudio).
 */
export const AIStudioPlatformSettings = () => {
  const { t } = useI18n();
  const aistudioSettings = useSettingsStore((s) => s.enhancedFeatures.aistudio) ?? {
    sidebarWidth: 320,
    autoHideInput: false,
    autoHideRunSettings: false,
  };
  const setAIStudioFeature = useSettingsStore((s) => s.setAIStudioFeature);

  const {
    sidebarWidth: storeSidebarWidth,
    autoHideInput,
    autoHideRunSettings,
  } = aistudioSettings;

  // Local state for immediate slider feedback
  const [localSidebarWidth, setLocalSidebarWidth] = useState(storeSidebarWidth);

  // Sync local state when store changes
  useEffect(() => {
    setLocalSidebarWidth(storeSidebarWidth);
  }, [storeSidebarWidth]);

  // Debounced store updates
  const debouncedSetSidebarWidth = useMemo(
    () => debounce((v: number) => setAIStudioFeature('sidebarWidth', v), 300),
    [setAIStudioFeature],
  );

  return (
    <div className="space-y-6">
      {/* Section 1: Layout Dimensions */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t('aistudioUI.layoutDimensions')}
        </h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Sidebar Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('aistudioUI.sidebarWidth')}
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {localSidebarWidth}px
              </span>
            </div>
            <input
              type="range"
              min={280}
              max={500}
              step={1}
              value={localSidebarWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalSidebarWidth(v);
                debouncedSetSidebarWidth(v);
              }}
              className="ui-slider w-full"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Additional Features */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t('aistudioUI.additionalFeatures')}
        </h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Auto-hide Input */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.autoHideInput')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.autoHideInputDesc')}
              </p>
            </div>
            <Switch
              checked={autoHideInput}
              onCheckedChange={(c) => setAIStudioFeature('autoHideInput', c)}
            />
          </div>

          {/* Auto-hide Run Settings */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.autoHideRunSettings')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.autoHideRunSettingsDesc')}
              </p>
            </div>
            <Switch
              checked={autoHideRunSettings}
              onCheckedChange={(c) =>
                setAIStudioFeature('autoHideRunSettings', c)
              }
            />
          </div>

          {/* Hotkey Helper */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.hotkeyHelper')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.hotkeyHelperDesc')}
              </p>
            </div>
            <Switch
              checked={aistudioSettings.showHotkeyHelper ?? true}
              onCheckedChange={(c) => setAIStudioFeature('showHotkeyHelper', c)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
