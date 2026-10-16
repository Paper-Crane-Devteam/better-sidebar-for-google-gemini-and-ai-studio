import React, { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { Button } from '@/shared/components/ui/button';
import type { UpdateCheckStatus } from '@/entrypoints/background/handlers/extension-update';
import { applyExtensionUpdate } from '../../extension-update/apply-update';

export type UpdateCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version?: string }
  | { kind: 'applying'; version?: string };

/** How long "Up to date" stays before the status clears. */
const UP_TO_DATE_MS = 4000;

/**
 * Update-check state machine for the About page. Split from the UI so the
 * status text (next to the version) and the action button (right side of the
 * card) can live in different places.
 */
export const useUpdateCheck = () => {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateCheckState>({ kind: 'idle' });

  useEffect(() => {
    if (state.kind !== 'upToDate') return;
    const timer = setTimeout(() => setState({ kind: 'idle' }), UP_TO_DATE_MS);
    return () => clearTimeout(timer);
  }, [state.kind]);

  const check = async () => {
    setState({ kind: 'checking' });
    try {
      const res = await browser.runtime.sendMessage({ type: 'CHECK_EXTENSION_UPDATE' });
      if (!res?.success) throw new Error(res?.error);
      const status: UpdateCheckStatus = res.data.status;
      const version: string | undefined = res.data.version;
      switch (status) {
        case 'ready':
        case 'update_available':
          setState({ kind: 'available', version });
          break;
        case 'no_update':
          setState({ kind: 'upToDate' });
          break;
        case 'throttled':
          toast.info(t('about.update.throttled'));
          setState({ kind: 'idle' });
          break;
        case 'unsupported':
          toast.info(t('about.update.unsupported'));
          setState({ kind: 'idle' });
          break;
        default:
          setState({ kind: 'idle' });
      }
    } catch (err) {
      console.error('[UpdateCheck] Check failed:', err);
      toast.error(t('about.update.checkFailed'));
      setState({ kind: 'idle' });
    }
  };

  const apply = async () => {
    if (state.kind !== 'available') return;
    const previous = state;
    const outcome = await applyExtensionUpdate(state.version, () =>
      setState({ kind: 'applying', version: previous.version }),
    );
    if (outcome !== 'reloading') setState(previous);
  };

  return { state, check, apply };
};

/** Short status shown after the version number. Renders nothing when idle. */
export const UpdateStatus = ({ state }: { state: UpdateCheckState }) => {
  const { t } = useI18n();

  let content: React.ReactNode = null;
  switch (state.kind) {
    case 'checking':
      // The button already spins; plain text here avoids a second spinner.
      content = <span>{t('about.update.checking')}</span>;
      break;
    case 'upToDate':
      content = (
        <span className="inline-flex items-center gap-1">
          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-500" aria-hidden="true" />
          {t('about.update.upToDateShort')}
        </span>
      );
      break;
    case 'available':
    case 'applying':
      content = (
        <span className="font-medium text-primary">
          {t('about.update.availableShort', { version: state.version ?? '' })}
        </span>
      );
      break;
  }

  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite">
      {content && (
        <>
          <span aria-hidden="true">·</span>
          {content}
        </>
      )}
    </span>
  );
};

/** Right-side action: "Check for updates", or "Update now" once one is found. */
export const UpdateAction = ({
  state,
  onCheck,
  onApply,
}: {
  state: UpdateCheckState;
  onCheck: () => void;
  onApply: () => void;
}) => {
  const { t } = useI18n();

  if (state.kind === 'available' || state.kind === 'applying') {
    const applying = state.kind === 'applying';
    return (
      <Button size="sm" className="shrink-0 gap-1.5" onClick={onApply} disabled={applying}>
        {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {applying ? t('about.update.applying') : t('about.update.updateNow')}
      </Button>
    );
  }

  const checking = state.kind === 'checking';
  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0 gap-1.5"
      onClick={onCheck}
      disabled={checking}
    >
      <RefreshCw
        className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
        aria-hidden="true"
      />
      {t('about.update.check')}
    </Button>
  );
};
