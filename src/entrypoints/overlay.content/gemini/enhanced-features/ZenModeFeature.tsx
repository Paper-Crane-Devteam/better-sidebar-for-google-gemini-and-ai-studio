import React from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';

export const ZenModeFeature = () => {
  const { t } = useI18n();
  const zenMode = useSettingsStore((s) => s.enhancedFeatures.gemini.zenMode);
  const setGeminiFeature = useSettingsStore((s) => s.setGeminiFeature);

  if (!zenMode) return null;

  return (
    <div className="fixed top-4 right-4 z-[999999]">
      <SimpleTooltip content={t('geminiUI.exitZenMode')}>
        <button
          onClick={() => setGeminiFeature('zenMode', false)}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-xl border border-border/50 bg-background/60 px-3 backdrop-blur-md transition-all hover:bg-accent hover:shadow-sm"
          )}
        >
          <Minimize className="h-4 w-4 text-foreground" />
          <span className="text-xs font-semibold text-foreground">{t('geminiUI.exitZenMode')}</span>
        </button>
      </SimpleTooltip>
    </div>
  );
};
