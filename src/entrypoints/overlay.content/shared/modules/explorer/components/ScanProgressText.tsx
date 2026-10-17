import { useEffect, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { onScanProgress } from '@/shared/lib/scan-progress';

/**
 * Live "scanned N · M new" line under the scanning spinner.
 *
 * Mounted only while a scan runs, so the known-id snapshot taken on mount is
 * the library as it was before the scan — the same baseline the background
 * diffs against when it saves the results.
 */
export const ScanProgressText = () => {
  const { t } = useI18n();
  const [knownIds] = useState(
    () =>
      new Set(
        useAppStore
          .getState()
          .conversations.map((c) => c.external_id)
          .filter((id): id is string => !!id),
      ),
  );
  const [progress, setProgress] = useState<{ scanned: number; fresh: number } | null>(null);

  useEffect(
    () =>
      onScanProgress(({ ids }) => {
        let fresh = 0;
        for (const id of ids) if (!knownIds.has(id)) fresh++;
        setProgress({ scanned: ids.length, fresh });
      }),
    [knownIds],
  );

  return (
    <div className="flex flex-col items-center gap-0.5 text-center" aria-live="polite">
      <p className="text-sm text-muted-foreground">{t('explorer.scanning')}</p>
      {progress && (
        <p className="text-xs text-muted-foreground/80 tabular-nums">
          {t('explorer.scanProgress', { scanned: progress.scanned, fresh: progress.fresh })}
        </p>
      )}
    </div>
  );
};
