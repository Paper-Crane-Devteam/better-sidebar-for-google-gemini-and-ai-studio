import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils/utils';
import type { UpdateCheckStatus } from '@/entrypoints/background/handlers/extension-update';
import { applyExtensionUpdate } from '../../extension-update/apply-update';

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version?: string }
  | { kind: 'applying'; version?: string };

/** How long "Up to date" stays before the link comes back. */
const UP_TO_DATE_MS = 4000;

/** Shared look for the small text buttons in the About page's version row. */
export const textButtonClass = cn(
  'inline-flex items-center gap-1 rounded-sm text-muted-foreground transition-colors',
  'hover:text-foreground hover:underline underline-offset-4',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-60',
);

export const Dot = () => <span aria-hidden="true">·</span>;

/**
 * Inline "Check for updates" / "Update now" for the About page's version row.
 * Renders a leading dot so it can sit right after the version number.
 */
export const UpdateCheck = () => {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'idle' });

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
          // Too long for the inline row; a toast reads better.
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

  const apply = async (version?: string) => {
    const previous = state;
    const outcome = await applyExtensionUpdate(version, () =>
      setState({ kind: 'applying', version }),
    );
    if (outcome !== 'reloading') setState(previous);
  };

  let content: React.ReactNode;
  switch (state.kind) {
    case 'checking':
      content = (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t('about.update.checking')}
        </span>
      );
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
        <>
          <span>{t('about.update.availableShort', { version: state.version ?? '' })}</span>
          <Dot />
          <button
            type="button"
            className={cn(textButtonClass, 'font-medium text-primary hover:text-primary')}
            onClick={() => apply(state.version)}
            disabled={state.kind === 'applying'}
          >
            {state.kind === 'applying' && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            {state.kind === 'applying' ? t('about.update.applying') : t('about.update.updateNow')}
          </button>
        </>
      );
      break;
    default:
      content = (
        <button type="button" className={textButtonClass} onClick={check}>
          {t('about.update.check')}
        </button>
      );
  }

  return (
    <>
      <Dot />
      <span className="contents" role="status" aria-live="polite">
        {content}
      </span>
    </>
  );
};
