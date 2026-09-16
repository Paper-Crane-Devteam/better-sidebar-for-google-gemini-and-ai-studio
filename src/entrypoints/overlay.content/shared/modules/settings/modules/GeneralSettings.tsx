import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { openMessageSyncModal } from '../../message-sync/MessageSyncModal';
import { Switch } from '@/shared/components/ui/switch';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { IconBarCustomizer } from '../../icon-bar';

export const GeneralSettings = () => {
  const { t } = useI18n();
  const {
    skipDeleteConfirm,
    setSkipDeleteConfirm,
    backfillHistory,
    setBackfillHistory,
  } = useSettingsStore();

  const { language, setLanguage } = usePegasusStore();

  const platform = detectPlatform();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('settings.appearance')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('settings.language')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('settings.languageDescription')}
              </p>
            </div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs min-w-[120px] justify-between"
                >
                  <span>
                    {language === 'en' && t('settings.english')}
                    {language === 'zh-CN' && t('settings.chinese')}
                    {language === 'ja' && t('settings.japanese')}
                    {language === 'zh-TW' && t('settings.chineseTraditional')}
                    {language === 'pt' && t('settings.portuguese')}
                    {language === 'es' && t('settings.spanish')}
                    {language === 'ru' && t('settings.russian')}
                  </span>
                  <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px]">
                <DropdownMenuRadioGroup
                  value={language}
                  onValueChange={(value) => {
                    if (
                      value === 'zh-CN' ||
                      value === 'zh-TW' ||
                      value === 'en' ||
                      value === 'ja' ||
                      value === 'pt' ||
                      value === 'es' ||
                      value === 'ru'
                    ) {
                      setLanguage(value);
                    }
                  }}
                >
                  <DropdownMenuRadioItem value="en">
                    {t('settings.english')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-CN">
                    {t('settings.chinese')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="ja">
                    {t('settings.japanese')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-TW">
                    {t('settings.chineseTraditional')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pt">
                    {t('settings.portuguese')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="es">
                    {t('settings.spanish')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="ru">
                    {t('settings.russian')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('settings.behavior')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          {(platform === Platform.GEMINI ||
            platform === Platform.AI_STUDIO) && (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-medium">
                  {t('settings.backfillHistory')}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t('settings.backfillHistoryDescription')}
                </p>
                <button
                  onClick={openMessageSyncModal}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline"
                >
                  <Info className="h-3 w-3" />
                  {t('settings.backfillStatusLink')}
                </button>
              </div>
              <Switch
                className="mt-0.5 shrink-0"
                checked={backfillHistory ?? false}
                onCheckedChange={setBackfillHistory}
              />
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <span className="text-sm font-medium">
                  {t('settings.skipDeleteConfirm')}
                </span>
              </div>
              <Switch
                checked={skipDeleteConfirm ?? false}
                onCheckedChange={setSkipDeleteConfirm}
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{t('settings.skipDeleteConfirmDescription')}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Same editor the rail's own right-click menu opens, so the two can never
          disagree about what is showing or in what order. */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('shortcuts.title')}</h3>
        <Separator />
        <div className="py-2">
          <IconBarCustomizer />
        </div>
      </div>
    </div>
  );
};
