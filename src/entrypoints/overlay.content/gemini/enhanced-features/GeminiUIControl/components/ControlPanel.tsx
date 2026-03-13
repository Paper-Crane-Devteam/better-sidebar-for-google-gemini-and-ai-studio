import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils/utils';
import { useGeminiUI } from '../hooks/useGeminiUI';
import { useI18n } from '@/shared/hooks/useI18n';

export const ControlPanel = () => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = React.useState(false);
  const {
    sidebarWidth,
    chatWidth,
    inputWidth,
    containerWidth,
    measuredChatWidth,
    measuredInputWidth,
    hideBrand,
    hideDisclaimer,
    hideUpgrade,
    showUpgradeOption,
    showTopBarTag,
    zenMode,
    setSidebarWidth,
    setChatWidth,
    setInputWidth,
    setHideBrand,
    setHideDisclaimer,
    setHideUpgrade,
    setShowTopBarTag,
    setZenMode,
    removeWatermark,
    setRemoveWatermark,
  } = useGeminiUI();

  // Helper to calculate percentage based on DOM measurements
  const getMeasuredPercent = (measured: number) => {
    if (!containerWidth || !measured) return null;
    return Math.round((measured / containerWidth) * 100);
  };

  return (
    <div className="fixed top-16 right-4 z-[999999]">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-background/60 backdrop-blur-md transition-all hover:bg-accent',
              isOpen && 'bg-accent shadow-sm ring-2 ring-ring/20',
            )}
          >
            {isOpen ? (
              <X className="h-4 w-4 text-foreground" />
            ) : (
              <SlidersHorizontal className="h-4 w-4 text-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-[340px] max-h-[85vh] flex flex-col rounded-2xl border border-border bg-popover/95 p-0 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 p-5 pb-4 border-b border-border/40 bg-popover/50 backdrop-blur-sm z-10">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {t('geminiUI.title')}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {t('geminiUI.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 pt-4 custom-scrollbar">
            {/* Section 1: Layout Dimensions */}
            <div className="space-y-5 mb-6">
              <div className="flex items-center gap-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {t('geminiUI.layoutDimensions')}
                </h4>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              <div className="space-y-4">
                {/* Sidebar Width */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      {t('geminiUI.sidebarWidth')}
                    </Label>
                    <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {sidebarWidth}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={550}
                    step={1}
                    value={sidebarWidth}
                    onChange={(e) => setSidebarWidth(Number(e.target.value))}
                    className="ui-slider"
                  />
                </div>

                {/* Chat Width */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      {t('geminiUI.chatContentWidth')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {chatWidth}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={1}
                    value={chatWidth}
                    onChange={(e) => setChatWidth(Number(e.target.value))}
                    className="ui-slider"
                  />
                </div>

                {/* Input Box Width */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      {t('geminiUI.inputBoxWidth')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {inputWidth}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={1}
                    value={inputWidth}
                    onChange={(e) => setInputWidth(Number(e.target.value))}
                    className="ui-slider"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Element Visibility */}
            <div className="space-y-5 mb-6">
              <div className="flex items-center gap-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {t('geminiUI.elementVisibility')}
                </h4>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              <div className="space-y-4">
                {/* Gemini Brand */}
                <div className="flex items-center justify-between group">
                  <div className="space-y-0.5">
                    <Label
                      className="text-xs font-semibold cursor-pointer"
                      onClick={() => setHideBrand(!hideBrand)}
                    >
                      {t('geminiUI.geminiLogo')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('geminiUI.geminiLogoDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={!hideBrand}
                    onCheckedChange={(c) => setHideBrand(!c)}
                  />
                </div>

                {/* AI Disclaimer */}
                <div className="flex items-center justify-between group">
                  <div className="space-y-0.5">
                    <Label
                      className="text-xs font-semibold cursor-pointer"
                      onClick={() => setHideDisclaimer(!hideDisclaimer)}
                    >
                      {t('geminiUI.aiDisclaimer')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('geminiUI.aiDisclaimerDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={!hideDisclaimer}
                    onCheckedChange={(c) => setHideDisclaimer(!c)}
                  />
                </div>

                {/* Upgrade Plan (Conditional) */}
                {showUpgradeOption && (
                  <div className="flex items-center justify-between group">
                    <div className="space-y-0.5">
                      <Label
                        className="text-xs font-semibold cursor-pointer"
                        onClick={() => setHideUpgrade(!hideUpgrade)}
                      >
                        {t('geminiUI.upgradeButton')}
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t('geminiUI.upgradeButtonDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={!hideUpgrade}
                      onCheckedChange={(c) => setHideUpgrade(!c)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Additional Features */}
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {t('geminiUI.additionalFeatures')}
                </h4>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              <div className="space-y-4">
                {/* Top Bar Conversation Tag */}
                <div className="flex items-center justify-between group">
                  <div className="space-y-0.5">
                    <Label
                      className="text-xs font-semibold cursor-pointer"
                      onClick={() => setShowTopBarTag(!showTopBarTag)}
                    >
                      {t('geminiUI.showConversationTag')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('geminiUI.showConversationTagDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={showTopBarTag}
                    onCheckedChange={(c) => setShowTopBarTag(c)}
                  />
                </div>

                {/* Remove AI Sparkle Image Watermark */}
                <div className="flex items-center justify-between group">
                  <div className="space-y-0.5">
                    <Label
                      className="text-xs font-semibold cursor-pointer"
                      onClick={() => setRemoveWatermark(!removeWatermark)}
                    >
                      {t('geminiUI.removeAutoWatermark')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('geminiUI.removeAutoWatermarkDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={removeWatermark}
                    onCheckedChange={(c) => setRemoveWatermark(c)}
                  />
                </div>

                {/* Zen Mode */}
                <div className="flex items-center justify-between group">
                  <div className="space-y-0.5">
                    <Label
                      className="text-xs font-semibold cursor-pointer"
                      onClick={() => setZenMode(!zenMode)}
                    >
                      {t('geminiUI.zenMode')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('geminiUI.zenModeDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={zenMode}
                    onCheckedChange={(c) => setZenMode(c)}
                  />
                </div>
              </div>
            </div>

            {/* Footer Decoration */}
            <div className="mt-6 flex justify-center pb-2">
              <div className="h-1 w-12 rounded-full bg-border/40" />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
