import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import { Switch } from '@/shared/components/ui/switch';
import {
  Loader2,
  UploadCloud,
  DownloadCloud,
  Link,
  Unlink,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import dayjs from 'dayjs';

type SyncDirection = 'up' | 'down' | 'merge' | null;

export const GDriveSyncSection = ({ hideTitle }: { hideTitle?: boolean }) => {
  const { t } = useI18n();
  const { gdriveAutoSync, setGdriveAutoSync } = usePegasusStore();

  const [gdriveSupported, setGdriveSupported] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState<{
    isAuthenticated: boolean;
    lastSyncTime?: number | null;
    lastSyncDirection?: SyncDirection;
    autoSyncing?: boolean;
  }>({ isAuthenticated: false });
  const [gdriveSyncing, setGdriveSyncing] = useState<SyncDirection>(null);
  const [gdriveConnecting, setGdriveConnecting] = useState(false);

  const fetchGdriveStatus = async () => {
    try {
      const supportRes = await browser.runtime.sendMessage({
        type: 'GDRIVE_CHECK_SUPPORT',
      });
      if (supportRes?.success) {
        setGdriveSupported(supportRes.data);
        if (!supportRes.data) return;
      }
      const res = await browser.runtime.sendMessage({
        type: 'GDRIVE_GET_STATUS',
      });
      if (res?.success) {
        setGdriveStatus(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch GDrive status:', e);
    }
  };

  useEffect(() => {
    fetchGdriveStatus();
  }, []);

  const directionLabel = (dir: SyncDirection) => {
    if (dir === 'up') return t('data.gdriveDirUp');
    if (dir === 'down') return t('data.gdriveDirDown');
    if (dir === 'merge') return t('data.gdriveDirMerge');
    return '';
  };

  const handleGdriveConnect = async () => {
    setGdriveConnecting(true);
    try {
      const res = await browser.runtime.sendMessage({ type: 'GDRIVE_AUTH' });
      if (res?.success) {
        await fetchGdriveStatus();
        toast.success(t('data.gdriveConnected'));
      } else {
        toast.error(res?.error || t('data.gdriveBackupFailed'));
      }
    } catch (e) {
      console.error('GDrive connect error:', e);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGdriveDisconnect = async () => {
    setGdriveConnecting(true);
    try {
      await browser.runtime.sendMessage({ type: 'GDRIVE_DISCONNECT' });
      setGdriveStatus({ isAuthenticated: false });
    } catch (e) {
      console.error('GDrive disconnect error:', e);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGdriveMerge = async () => {
    setGdriveSyncing('merge');
    try {
      const res = await browser.runtime.sendMessage({ type: 'GDRIVE_MERGE' });
      if (res?.success) {
        toast.success(t('data.gdriveSyncSuccess'));
        await fetchGdriveStatus();
      } else {
        toast.error(res?.error || t('data.gdriveBackupFailed'));
      }
    } catch (e) {
      toast.error(t('data.gdriveBackupFailed'));
    } finally {
      setGdriveSyncing(null);
    }
  };

  const handleGdriveBackup = async () => {
    const confirmed = await modal.confirm({
      title: t('data.gdriveBackup'),
      content: t('data.gdriveBackupConfirm'),
      confirmText: t('data.gdriveBackup'),
      cancelText: t('common.cancel'),
    });
    if (!confirmed) return;

    setGdriveSyncing('up');
    try {
      const res = await browser.runtime.sendMessage({
        type: 'GDRIVE_SYNC_UP',
      });
      if (res?.success) {
        toast.success(t('data.gdriveBackupSuccess'));
        await fetchGdriveStatus();
      } else {
        toast.error(res?.error || t('data.gdriveBackupFailed'));
      }
    } catch (e) {
      toast.error(t('data.gdriveBackupFailed'));
    } finally {
      setGdriveSyncing(null);
    }
  };

  const handleGdriveRestore = async () => {
    const confirmed = await modal.confirm({
      title: t('data.gdriveRestore'),
      content: t('data.gdriveRestoreConfirm'),
      confirmText: t('data.gdriveRestore'),
      cancelText: t('common.cancel'),
    });
    if (!confirmed) return;

    setGdriveSyncing('down');
    try {
      const res = await browser.runtime.sendMessage({
        type: 'GDRIVE_SYNC_DOWN',
      });
      if (res?.success) {
        toast.success(t('data.gdriveRestoreSuccess'));
        await fetchGdriveStatus();
      } else {
        toast.error(res?.error || t('data.gdriveRestoreFailed'));
      }
    } catch (e) {
      toast.error(t('data.gdriveRestoreFailed'));
    } finally {
      setGdriveSyncing(null);
    }
  };

  if (!gdriveSupported) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('data.gdriveUnsupported')}
      </div>
    );
  }

  return (
    <div className={hideTitle ? '' : 'space-y-2'}>
      {!hideTitle && (
        <>
          <h3 className="text-lg font-medium">{t('data.gdriveSync')}</h3>
          <Separator />
        </>
      )}
      <div
        className={`p-4 border rounded-lg bg-muted/10 space-y-3 ${hideTitle ? '' : 'mt-3'}`}
      >
        {/* Connection status */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">
              {gdriveStatus.isAuthenticated
                ? t('data.gdriveConnected')
                : t('data.gdriveNotConnected')}
            </span>
            {gdriveStatus.lastSyncTime && (
              <p className="text-xs text-muted-foreground">
                {t('data.gdriveLastSync')}:{' '}
                {dayjs
                  .unix(gdriveStatus.lastSyncTime)
                  .format('YYYY-MM-DD HH:mm')}
                {gdriveStatus.lastSyncDirection && (
                  <span className="ml-1 text-muted-foreground/70">
                    ({directionLabel(gdriveStatus.lastSyncDirection)})
                  </span>
                )}
              </p>
            )}
            {gdriveStatus.autoSyncing && (
              <p className="text-xs text-blue-500">
                {t('data.gdriveAutoSyncing')}
              </p>
            )}
          </div>
          {gdriveStatus.isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleGdriveDisconnect}
              disabled={gdriveConnecting || gdriveSyncing !== null}
            >
              {gdriveConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              {t('data.gdriveDisconnect')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleGdriveConnect}
              disabled={gdriveConnecting}
            >
              {gdriveConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link className="h-4 w-4" />
              )}
              {t('data.gdriveConnect')}
            </Button>
          )}
        </div>

        {/* Sync controls (only when authenticated) */}
        {gdriveStatus.isAuthenticated && (
          <>
            <Separator />

            {/* Auto-sync toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t('data.gdriveAutoSyncLabel')}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t('data.gdriveAutoSyncDesc')}
                </p>
              </div>
              <Switch
                checked={gdriveAutoSync}
                onCheckedChange={setGdriveAutoSync}
              />
            </div>

            <Separator />

            {/* Merge sync button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleGdriveMerge}
              disabled={gdriveSyncing !== null}
            >
              {gdriveSyncing === 'merge' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('data.gdriveMergeSync')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('data.gdriveMergeSyncDesc')}
            </p>

            <Separator />

            {/* Manual backup/restore */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleGdriveBackup}
                disabled={gdriveSyncing !== null}
              >
                {gdriveSyncing === 'up' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {t('data.gdriveBackup')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleGdriveRestore}
                disabled={gdriveSyncing !== null}
              >
                {gdriveSyncing === 'down' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DownloadCloud className="h-4 w-4" />
                )}
                {t('data.gdriveRestore')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
              {t('data.gdriveRestoreWarning')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
