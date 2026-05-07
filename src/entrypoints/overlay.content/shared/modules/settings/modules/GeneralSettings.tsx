import React, { useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Moon, Sun, Monitor, ChevronDown, Folder } from 'lucide-react';
import { Switch } from '@/shared/components/ui/switch';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { FolderPicker } from '@/shared/components/FolderPicker';
import { useModalStore } from '@/shared/lib/modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';

export const GeneralSettings = () => {
  const { t } = useI18n();
  const {
    layoutDensity,
    setLayoutDensity,
    newChatBehavior,
    setNewChatBehavior,
    shortcuts,
    setShortcutVisible,
  } = useSettingsStore();

  const { language, setLanguage, defaultSyncFolderId, setDefaultSyncFolderId } = usePegasusStore();
  const folders = useAppStore((state) => state.folders);

  const { theme, setTheme } = useTheme();
  const platform = detectPlatform();
  const openModal = useModalStore((state) => state.open);
  const closeModal = useModalStore((state) => state.close);

  const selectedFolderName = useMemo(() => {
    if (!defaultSyncFolderId) return t('settings.defaultSyncFolderImported');
    if (defaultSyncFolderId === '__root__') return t('moveItemsDialog.rootLevel');
    const folder = folders.find((f) => f.id === defaultSyncFolderId);
    return folder?.name ?? t('settings.defaultSyncFolderImported');
  }, [defaultSyncFolderId, folders, t]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('settings.appearance')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t('settings.theme')}</span>
              <p className="text-xs text-muted-foreground">
                {t('settings.themeDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <SimpleTooltip content={t('settings.light')}>
                <Button
                  variant={theme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('light')}
                >
                  <Sun className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.system')}>
                <Button
                  variant={theme === 'system' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('system')}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.dark')}>
                <Button
                  variant={theme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            </div>
          </div>

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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('settings.layoutDensity')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('settings.layoutDensityDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <Button
                variant={layoutDensity === 'relaxed' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setLayoutDensity('relaxed')}
              >
                {t('settings.relaxed')}
              </Button>
              <Button
                variant={layoutDensity === 'compact' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setLayoutDensity('compact')}
              >
                {t('settings.compact')}
              </Button>
            </div>
          </div>

        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('shortcuts.title')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                {t('shortcuts.favorites')}
              </label>
            </div>
            <Switch
              checked={shortcuts?.favorites ?? true}
              onCheckedChange={(c) => setShortcutVisible('favorites', c)}
            />
          </div>
          {platform === Platform.AI_STUDIO && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.build')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.build ?? true}
                  onCheckedChange={(c) => setShortcutVisible('build', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.dashboard')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.dashboard ?? true}
                  onCheckedChange={(c) => setShortcutVisible('dashboard', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.documentation')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.documentation ?? true}
                  onCheckedChange={(c) =>
                    setShortcutVisible('documentation', c)
                  }
                />
              </div>
            </>
          )}
          {platform === Platform.CHATGPT && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.images')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.images ?? true}
                  onCheckedChange={(c) => setShortcutVisible('images', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.apps')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.apps ?? true}
                  onCheckedChange={(c) => setShortcutVisible('apps', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.codex')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.codex ?? true}
                  onCheckedChange={(c) => setShortcutVisible('codex', c)}
                />
              </div>
            </>
          )}
          {platform === Platform.GEMINI && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.myStuff')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.myStuff ?? true}
                  onCheckedChange={(c) => setShortcutVisible('myStuff', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.gems')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.gems ?? true}
                  onCheckedChange={(c) => setShortcutVisible('gems', c)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    {t('shortcuts.notebooks')}
                  </label>
                </div>
                <Switch
                  checked={shortcuts?.notebooks ?? true}
                  onCheckedChange={(c) => setShortcutVisible('notebooks', c)}
                />
              </div>
            </>
          )}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                {t('shortcuts.originalUI')}
              </label>
            </div>
            <Switch
              checked={shortcuts?.originalUI ?? true}
              onCheckedChange={(c) => setShortcutVisible('originalUI', c)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('settings.behavior')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('settings.newChatBehavior')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('settings.newChatBehaviorDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <Button
                variant={
                  newChatBehavior === 'current-tab' ? 'secondary' : 'ghost'
                }
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setNewChatBehavior('current-tab')}
              >
                {t('settings.currentTab')}
              </Button>
              <Button
                variant={newChatBehavior === 'new-tab' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setNewChatBehavior('new-tab')}
              >
                {t('settings.newTab')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('settings.defaultSyncFolder')}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t('settings.defaultSyncFolderDescription')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs min-w-[120px] justify-between"
                onClick={() => {
                  openModal({
                    id: 'default-sync-folder',
                    type: 'info',
                    title: t('settings.defaultSyncFolder'),
                    content: (
                      <FolderPicker
                        folders={folders}
                        onSelect={(folderId) => {
                          setDefaultSyncFolderId(folderId === null ? '__root__' : folderId);
                          closeModal();
                        }}
                        initialSelectedId={
                          defaultSyncFolderId === '__root__' ? null : defaultSyncFolderId
                        }
                        className="min-h-[200px] max-h-[300px]"
                      />
                    ),
                    confirmText: t('common.cancel'),
                    onConfirm: () => closeModal(),
                    onCancel: () => closeModal(),
                  });
                }}
              >
                <Folder className="h-3 w-3 mr-1.5 shrink-0" />
                <span className="truncate max-w-[140px]">{selectedFolderName}</span>
                <ChevronDown className="h-3 w-3 ml-2 opacity-50 shrink-0" />
              </Button>
            </div>
            {defaultSyncFolderId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => setDefaultSyncFolderId(null)}
              >
                ↩ {t('settings.defaultSyncFolderImported')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
