import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useHostPermission } from '@/shared/hooks/useHostPermission';
import { NOTION_ORIGIN } from '@/shared/lib/host-permission';
import { Loader2, Check, X, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import {
  testNotionConnection,
  searchNotionPages,
} from '../../../features/export/notion';
import notionIcon from '@/assets/icons/notion.svg';

export const IntegrationsSettings = () => {
  const { t } = useI18n();
  const { integrations, setNotionConfig } = useSettingsStore();
  const {
    apiKey,
    parentPageId,
    connectionStatus,
    connectionName,
    connectionError,
    cachedPages,
    lastFetchedAt,
  } = integrations.notion;

  const notionPermission = useHostPermission(NOTION_ORIGIN);

  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);

  const pages = cachedPages;

  const fetchConnectionAndPages = useCallback(async () => {
    setLoadingPages(true);
    const result = await testNotionConnection();
    if (result.ok) {
      try {
        const results = await searchNotionPages();
        setNotionConfig({
          connectionStatus: 'ok',
          connectionName: result.name || '',
          connectionError: '',
          cachedPages: results,
          lastFetchedAt: Date.now(),
        });
      } catch {
        setNotionConfig({
          connectionStatus: 'ok',
          connectionName: result.name || '',
          connectionError: '',
          cachedPages: [],
          lastFetchedAt: Date.now(),
        });
      }
    } else {
      setNotionConfig({
        connectionStatus: 'error',
        connectionName: '',
        connectionError: result.error || 'Unknown error',
        cachedPages: [],
        lastFetchedAt: Date.now(),
      });
    }
    setLoadingPages(false);
  }, [setNotionConfig]);

  // On mount: use cache if available, otherwise fetch
  useEffect(() => {
    if (!apiKey) return;
    if (lastFetchedAt && connectionStatus !== 'idle') return;
    void fetchConnectionAndPages();
  }, [apiKey, lastFetchedAt, connectionStatus, fetchConnectionAndPages]);

  const handleRefreshPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const results = await searchNotionPages();
      setNotionConfig({ cachedPages: results, lastFetchedAt: Date.now() });
    } catch {
      setNotionConfig({ cachedPages: [] });
    }
    setLoadingPages(false);
  }, [setNotionConfig]);

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    setNotionConfig({
      apiKey: trimmed,
      connectionStatus: 'idle',
      connectionName: '',
      connectionError: '',
      cachedPages: [],
      lastFetchedAt: null,
    });
    setTesting(true);

    // Wait a tick for the store to update before testing
    await new Promise((r) => setTimeout(r, 50));
    await fetchConnectionAndPages();
    setTesting(false);
  };

  const handleClearApiKey = () => {
    setNotionConfig({
      apiKey: '',
      parentPageId: '',
      parentPageTitle: '',
      connectionStatus: 'idle',
      connectionName: '',
      connectionError: '',
      cachedPages: [],
      lastFetchedAt: null,
    });
    setApiKeyInput('');
  };

  return (
    <div className="space-y-6">
      {/* Notion */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <img src={notionIcon} alt="Notion" className="h-5 w-5" />
          <h3 className="text-lg font-medium">Notion</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('integrations.notionDescription')}
        </p>
        <Separator />
      </div>

      {/* Gate: Host permission required first.
          While the permission check is still in flight we render nothing below
          the header — showing the "grant permission" branch optimistically makes
          the button flash for a frame on every panel switch. */}
      {notionPermission.checking ? null : !notionPermission.granted ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('integrations.notionPermissionHint')}
          </p>
          <Button
            onClick={notionPermission.request}
            disabled={notionPermission.requesting}
            className="gap-2"
          >
            {notionPermission.requesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {t('integrations.notionGrantPermission')}
          </Button>
        </div>
      ) : (
        <>
          {/* Step 1: API Key */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('integrations.step1')}
            </p>
            <label className="text-sm font-medium">{t('integrations.notionApiKey')}</label>
            <p className="text-xs text-muted-foreground">
              {t('integrations.notionApiKeyHint')}{' '}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                notion.so/my-integrations
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="ntn_..."
                className="flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || testing}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
              </Button>
              {apiKey && (
                <Button size="sm" variant="ghost" onClick={handleClearApiKey}>
                  {t('integrations.disconnect')}
                </Button>
              )}
            </div>

            {/* Connection status */}
            {connectionStatus === 'ok' && (
              <div className="flex items-center gap-2 text-sm text-success">
                <Check className="h-4 w-4" />
                {t('integrations.connected')}: {connectionName}
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <X className="h-4 w-4" />
                {t('integrations.connectionFailed')}: {connectionError}
              </div>
            )}
          </div>

          {/* Step 2: Select parent page (only show when connected) */}
          {connectionStatus === 'ok' && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('integrations.step2')}
                </p>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t('integrations.notionParentPage')}</label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={handleRefreshPages}
                    disabled={loadingPages}
                  >
                    {loadingPages ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    {t('integrations.refresh')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('integrations.notionParentPageHint')}
                </p>

                {loadingPages ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : pages.length > 0 ? (
                  <Select
                    value={parentPageId || undefined}
                    onValueChange={(value) => {
                      const page = pages.find((p) => p.id === value);
                      if (page) {
                        setNotionConfig({ parentPageId: page.id, parentPageTitle: page.title });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('integrations.selectPage')} />
                    </SelectTrigger>
                    <SelectContent>
                      {pages.map((page) => (
                        <SelectItem key={page.id} value={page.id}>
                          {page.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-muted-foreground py-2 space-y-1">
                    <p>{t('integrations.noPagesFound')}</p>
                    <p className="text-warning">
                      {t('integrations.noPagesPermissionHint')}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
