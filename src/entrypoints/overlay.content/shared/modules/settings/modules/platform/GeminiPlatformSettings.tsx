import React, { useState, useEffect, useMemo } from 'react';
import { Separator } from '../../../../components/ui/separator';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { debounce } from 'lodash';

/**
 * Gemini platform-specific settings.
 * Mirrors the GeminiUIControl dropdown but rendered inside the settings modal.
 * All state is synced via the same stores (enhancedFeatures.gemini).
 */
export const GeminiPlatformSettings = () => {
  const { t } = useI18n();
  const geminiSettings = usePegasusStore((s) => s.enhancedFeatures?.gemini);
  const setGeminiFeature = usePegasusStore((s) => s.setGeminiEnhancedFeature);

  const {
    sidebarWidth: storeSidebarWidth = 360,
    chatWidth: storeChatWidth = 46,
    inputWidth: storeInputWidth = 42,
    hideBrand = false,
    hideDisclaimer = false,
    hideUpgrade = false,
    showTopBarTag = true,
    zenMode = false,
    showSmartScrollbar = true,
    autoHideInput = false,
  } = geminiSettings ?? {};

  // Local state for immediate slider feedback
  const [localSidebarWidth, setLocalSidebarWidth] = useState(storeSidebarWidth);
  const [localChatWidth, setLocalChatWidth] = useState(storeChatWidth);
  const [localInputWidth, setLocalInputWidth] = useState(storeInputWidth);

  const [showUpgradeOption, setShowUpgradeOption] = useState(false);

  // Check for upgrade option
  useEffect(() => {
    const checkUpgradeBtn = () => {
      const upgradeBtn =
        document.querySelector('upsell-button') ||
        document.querySelector('g1-dynamic-upsell-button');
      setShowUpgradeOption(!!upgradeBtn);
    };
    checkUpgradeBtn();
    const timer = setTimeout(checkUpgradeBtn, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Sync local state when store changes
  useEffect(() => {
    setLocalSidebarWidth(storeSidebarWidth);
  }, [storeSidebarWidth]);

  useEffect(() => {
    setLocalChatWidth(storeChatWidth);
  }, [storeChatWidth]);

  useEffect(() => {
    setLocalInputWidth(storeInputWidth);
  }, [storeInputWidth]);

  // Debounced store updates
  const debouncedSetSidebarWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('sidebarWidth', v), 300),
    [setGeminiFeature],
  );

  const debouncedSetChatWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('chatWidth', v), 300),
    [setGeminiFeature],
  );

  const debouncedSetInputWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('inputWidth', v), 300),
    [setGeminiFeature],
  );

  return (
    <div className="space-y-6">
      {/* Section 1: Layout Dimensions */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('geminiUI.layoutDimensions')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Sidebar Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('geminiUI.sidebarWidth')}
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {localSidebarWidth}px
              </span>
            </div>
            <input
              type="range"
              min={300}
              max={550}
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

          {/* Chat Content Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('geminiUI.chatContentWidth')}
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {localChatWidth}%
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={1}
              value={localChatWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalChatWidth(v);
                debouncedSetChatWidth(v);
              }}
              className="ui-slider w-full"
            />
          </div>

          {/* Input Box Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('geminiUI.inputBoxWidth')}
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {localInputWidth}%
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={1}
              value={localInputWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalInputWidth(v);
                debouncedSetInputWidth(v);
              }}
              className="ui-slider w-full"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Element Visibility */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('geminiUI.elementVisibility')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Gemini Logo */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.geminiLogo')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.geminiLogoDesc')}
              </p>
            </div>
            <Switch
              checked={!hideBrand}
              onCheckedChange={(c) => setGeminiFeature('hideBrand', !c)}
            />
          </div>

          {/* AI Disclaimer */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.aiDisclaimer')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.aiDisclaimerDesc')}
              </p>
            </div>
            <Switch
              checked={!hideDisclaimer}
              onCheckedChange={(c) => setGeminiFeature('hideDisclaimer', !c)}
            />
          </div>

          {/* Upgrade Button (conditional) */}
          {showUpgradeOption && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t('geminiUI.upgradeButton')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('geminiUI.upgradeButtonDesc')}
                </p>
              </div>
              <Switch
                checked={!hideUpgrade}
                onCheckedChange={(c) => setGeminiFeature('hideUpgrade', !c)}
              />
            </div>
          )}

          {/* Hotkey Helper */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.hotkeyHelper')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.hotkeyHelperDesc')}
              </p>
            </div>
            <Switch
              checked={geminiSettings?.showHotkeyHelper ?? true}
              onCheckedChange={(c) => setGeminiFeature('showHotkeyHelper', c)}
            />
          </div>
        </div>
      </div>

      {/* Section 3: Additional Features */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('geminiUI.additionalFeatures')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Zen Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.zenMode')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.zenModeDesc')}
              </p>
            </div>
            <Switch
              checked={zenMode}
              onCheckedChange={(c) => setGeminiFeature('zenMode', c)}
            />
          </div>

          {/* Show Conversation Tag */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.showConversationTag')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.showConversationTagDesc')}
              </p>
            </div>
            <Switch
              checked={showTopBarTag}
              onCheckedChange={(c) => setGeminiFeature('showTopBarTag', c)}
            />
          </div>

          {/* Smart Scrollbar */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.smartScrollbar')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.smartScrollbarDesc')}
              </p>
            </div>
            <Switch
              checked={showSmartScrollbar}
              onCheckedChange={(c) =>
                setGeminiFeature('showSmartScrollbar', c)
              }
            />
          </div>

          {/* Auto-hide Input */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.autoHideInput')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.autoHideInputDesc')}
              </p>
            </div>
            <Switch
              checked={autoHideInput}
              onCheckedChange={(c) =>
                setGeminiFeature('autoHideInput', c)
              }
            />
          </div>

          {/* Slash Commands (`/`) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.slashCommand')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.slashCommandDesc')}
              </p>
            </div>
            <Switch
              checked={geminiSettings?.slashCommand ?? true}
              onCheckedChange={(c) => setGeminiFeature('slashCommand', c)}
            />
          </div>

          {/* Agent Trigger (`>`) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.agentTrigger')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.agentTriggerDesc')}
              </p>
            </div>
            <Switch
              checked={geminiSettings?.agentTrigger ?? true}
              onCheckedChange={(c) => setGeminiFeature('agentTrigger', c)}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Selection Toolbar */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('geminiUI.selectionToolbar')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {t('geminiUI.selectionToolbar')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('geminiUI.selectionToolbarDesc')}
              </p>
            </div>
            <Switch
              checked={geminiSettings.selectionToolbar?.enabled ?? true}
              onCheckedChange={(c) =>
                setGeminiFeature('selectionToolbar', {
                  ...(geminiSettings.selectionToolbar ?? {
                    enabled: true,
                    reference: true,
                    explain: true,
                    saveAsSnippet: true,
                    summarize: false,
                    copy: true,
                    saveAsPrompt: true,
                  }),
                  enabled: c,
                })
              }
            />
          </div>

          {/* Individual toolbar actions (only show when enabled) */}
          {(geminiSettings.selectionToolbar?.enabled ?? true) && (
            <div className="grid gap-4 pl-4 border-l border-border/40">
              {/* Reference */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarReference')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarReferenceDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.reference ?? true}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      reference: c,
                    })
                  }
                />
              </div>

              {/* Explain */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarExplain')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarExplainDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.explain ?? true}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      explain: c,
                    })
                  }
                />
              </div>

              {/* Save as Snippet */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarSaveAsSnippet')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarSaveAsSnippetDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.saveAsSnippet ?? true}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      saveAsSnippet: c,
                    })
                  }
                />
              </div>

              {/* Summarize */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarSummarize')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarSummarizeDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.summarize ?? false}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      summarize: c,
                    })
                  }
                />
              </div>

              {/* Copy */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarCopy')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarCopyDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.copy ?? true}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      copy: c,
                    })
                  }
                />
              </div>

              {/* Save as Prompt */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t('geminiUI.selectionToolbarSaveAsPrompt')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('geminiUI.selectionToolbarSaveAsPromptDesc')}
                  </p>
                </div>
                <Switch
                  checked={geminiSettings.selectionToolbar?.saveAsPrompt ?? true}
                  onCheckedChange={(c) =>
                    setGeminiFeature('selectionToolbar', {
                      ...(geminiSettings.selectionToolbar ?? {
                        enabled: true,
                        reference: true,
                        explain: true,
                        saveAsSnippet: true,
                        summarize: false,
                        copy: true,
                        saveAsPrompt: true,
                      }),
                      saveAsPrompt: c,
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
