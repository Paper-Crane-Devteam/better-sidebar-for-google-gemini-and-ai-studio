import React, { useState, useEffect, useMemo } from 'react';
import { Separator } from '../../../../components/ui/separator';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { debounce } from 'lodash';

/**
 * AI Studio platform-specific settings.
 * Mirrors the AIStudioUIControl dropdown but rendered inside the settings modal.
 * All state is synced via the same stores (enhancedFeatures.aistudio).
 */
export const AIStudioPlatformSettings = () => {
  const { t } = useI18n();
  const aistudioSettings = usePegasusStore((s) => s.enhancedFeatures.aistudio) ?? {
    sidebarWidth: 320,
    autoHideInput: false,
    autoHideRunSettings: false,
    showSmartScrollbar: true,
    showHotkeyHelper: true,
    slashCommand: true,
    agentTrigger: true,
  };
  const setAIStudioFeature = usePegasusStore((s) => s.setAIStudioEnhancedFeature);

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

          {/* Smart Scrollbar */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.smartScrollbar')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.smartScrollbarDesc')}
              </p>
            </div>
            <Switch
              checked={aistudioSettings.showSmartScrollbar ?? true}
              onCheckedChange={(c) => setAIStudioFeature('showSmartScrollbar', c)}
            />
          </div>

          {/* Slash Commands */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.slashCommand')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.slashCommandDesc')}
              </p>
            </div>
            <Switch
              checked={aistudioSettings.slashCommand ?? true}
              onCheckedChange={(c) => setAIStudioFeature('slashCommand', c)}
            />
          </div>

          {/* Agent Trigger (`>`) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('aistudioUI.agentTrigger')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('aistudioUI.agentTriggerDesc')}
              </p>
            </div>
            <Switch
              checked={aistudioSettings.agentTrigger ?? true}
              onCheckedChange={(c) => setAIStudioFeature('agentTrigger', c)}
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
