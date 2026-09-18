/**
 * Reusable hook for checking and requesting optional host permissions.
 *
 * Works from content script context — opens an extension tab to handle
 * the actual chrome.permissions.request() call since content scripts
 * can't call it directly.
 *
 * Usage:
 * ```tsx
 * import { useHostPermission } from '@/shared/hooks/useHostPermission';
 * import { NOTION_ORIGIN } from '@/shared/lib/host-permission';
 *
 * const { granted, checking, requesting, request } = useHostPermission(NOTION_ORIGIN);
 *
 * if (checking) return null; // avoid flashing the un-granted state
 * if (!granted) {
 *   return <Button onClick={request}>Allow access to Notion API</Button>;
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { hasHostPermission, openPermissionPage, removeHostPermission } from '@/shared/lib/host-permission';

export interface UseHostPermissionReturn {
  /** Whether the permission is currently granted */
  granted: boolean;
  /**
   * True until the first async permission check for this origin resolves.
   * Callers should hold off on rendering permission-dependent UI while this is
   * true, otherwise the "not granted" branch flashes for a frame before the
   * real status arrives.
   */
  checking: boolean;
  /** Whether a permission request is in progress */
  requesting: boolean;
  /** Request the permission (opens extension tab for user to confirm) */
  request: () => Promise<boolean>;
  /** Revoke the permission */
  revoke: () => Promise<boolean>;
  /** Re-check permission status */
  refresh: () => Promise<void>;
}

/**
 * Module-level cache of the last known status per origin.
 *
 * `chrome.permissions.contains()` is async, so a freshly mounted hook has no
 * status to report yet. Seeding state from this cache makes every mount after
 * the first one synchronous — remounting a panel no longer flickers.
 * Kept in sync by refresh/request/revoke below.
 */
const statusCache = new Map<string, boolean>();

export function useHostPermission(origin: string): UseHostPermissionReturn {
  const [granted, setGranted] = useState(() => statusCache.get(origin) ?? false);
  const [checking, setChecking] = useState(() => !statusCache.has(origin));
  const [requesting, setRequesting] = useState(false);

  const apply = useCallback(
    (value: boolean) => {
      statusCache.set(origin, value);
      setGranted(value);
      setChecking(false);
    },
    [origin],
  );

  const refresh = useCallback(async () => {
    apply(await hasHostPermission(origin));
  }, [origin, apply]);

  useEffect(() => {
    // Re-seed from cache in case `origin` changed after the initial render,
    // then verify against the real permission state.
    const cached = statusCache.get(origin);
    setGranted(cached ?? false);
    setChecking(cached === undefined);
    void refresh();
  }, [origin, refresh]);

  // Listen for permission grant signal from the permissions page
  useEffect(() => {
    const listener = (
      changes: Record<string, { oldValue?: any; newValue?: any }>,
      areaName: string,
    ) => {
      if (areaName === 'local' && '_permission_granted' in changes) {
        void refresh();
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const request = useCallback(async (): Promise<boolean> => {
    setRequesting(true);
    try {
      const result = await openPermissionPage(origin);
      apply(result);
      return result;
    } finally {
      setRequesting(false);
    }
  }, [origin, apply]);

  const revoke = useCallback(async (): Promise<boolean> => {
    const result = await removeHostPermission(origin);
    if (result) apply(false);
    return result;
  }, [origin, apply]);

  return { granted, checking, requesting, request, revoke, refresh };
}
