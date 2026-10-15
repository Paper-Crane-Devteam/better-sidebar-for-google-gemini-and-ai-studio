import React, { useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import type { UpdateCheckStatus } from '@/entrypoints/background/handlers/extension-update';
import { applyExtensionUpdate } from '../../extension-update/apply-update';

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; status: UpdateCheckStatus; version?: string }
  | { kind: 'applying'; version?: string };

/** "Check for updates" / "Update now" on the About page. */
export const UpdateCheck = () => {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const check = async () => {
    setState({ kind: 'checking' });
    try {
      const res = await browser.runtime.sendMessage({ type: 'CHECK_EXTENSION_UPDATE' });
      if (!res?.success) throw new Error(res?.error);
      setState({ kind: 'result', status: res.data.status, version: res.data.version });
    } catch (err) {
      console.error('[UpdateCheck] Check failed:', err);
      toast.error(t('about.update.checkFailed'));
      setState({ kind: 'idle' });
    }
  };

  const apply = async (version?: string) => {
    const previous = state;
    const outcome = await applyExtensionUpdate(version, () =>
      setState({ kind: 'applying', version }),
    );
    if (outcome !== 'reloading') setState(previous);
  };

  const busy = state.kind === 'checking' || state.kind === 'applying';
  const result = state.kind === 'result' ? state : null;
  const hasUpdate =
    result && (result.status === 'ready' || result.status === 'update_available');

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-fit flex items-center gap-2"
          onClick={check}
          disabled={busy}
        >
          {state.kind === 'checking' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {state.kind === 'checking' ? t('about.update.checking') : t('about.update.check')}
        </Button>

        {(hasUpdate || state.kind === 'applying') && (
          <Button
            size="sm"
            className="w-fit flex items-center gap-2"
            onClick={() => apply(result?.version)}
            disabled={busy}
          >
            {state.kind === 'applying' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {state.kind === 'applying' ? t('about.update.applying') : t('about.update.updateNow')}
          </Button>
        )}
      </div>

      {result && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {result.status === 'ready' &&
            t('about.update.ready', { version: result.version ?? '' })}
          {result.status === 'update_available' &&
            t('about.update.available', { version: result.version ?? '' })}
          {result.status === 'no_update' && t('about.update.upToDate')}
          {result.status === 'throttled' && t('about.update.throttled')}
          {result.status === 'unsupported' && t('about.update.unsupported')}
        </p>
      )}
    </div>
  );
};
