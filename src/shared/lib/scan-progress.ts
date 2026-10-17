/**
 * Live progress for the full chat-list scan.
 *
 * The scanner (content script) and the overlay UI (overlay content script) run
 * in the same isolated world, so a window CustomEvent is enough — no round trip
 * through the background. The scanner reports the external ids it has seen so
 * far; the overlay diffs them against what it already knows to show "N new".
 */
const SCAN_PROGRESS_EVENT = 'BETTER_SIDEBAR_SCAN_PROGRESS';

export interface ScanProgressDetail {
  /** Unique external ids collected so far in this scan. */
  ids: string[];
}

export function emitScanProgress(ids: Iterable<string>) {
  window.dispatchEvent(
    new CustomEvent<ScanProgressDetail>(SCAN_PROGRESS_EVENT, {
      detail: { ids: Array.from(ids) },
    }),
  );
}

export function onScanProgress(cb: (detail: ScanProgressDetail) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ScanProgressDetail>).detail;
    if (detail?.ids) cb(detail);
  };
  window.addEventListener(SCAN_PROGRESS_EVENT, listener);
  return () => window.removeEventListener(SCAN_PROGRESS_EVENT, listener);
}
