/**
 * Background license renewal.
 *
 * The activation call hands back a 14-day validation window. Nothing used to push
 * that window forward, so a paying user simply stopped being a paying user two
 * weeks after activating. This module keeps the window fresh.
 *
 * Design notes:
 *
 * - Renewal starts `RENEW_LEAD_MS` *before* expiry, so a user who is offline for
 *   a few days still gets several retry attempts inside the paid window.
 * - Attempts are throttled through a shared storage timestamp, not an in-memory
 *   flag, because the service worker restarts constantly and every open tab runs
 *   its own copy of this code.
 * - A failure only ends the entitlement when the server explicitly rejects the
 *   token. Network failures fall into the grace window instead.
 */

import { useLicenseStore } from './license-store';
import { revalidateLicense, classifyValidationFailure } from './license-api';

/** Alarm name for the periodic renewal check (background service worker). */
export const LICENSE_RENEWAL_ALARM = 'license-renewal-check';

/** How often the background worker wakes up to consider renewing. */
const RENEWAL_CHECK_INTERVAL_MINUTES = 6 * 60; // 6 hours

/** Start renewing this long before `expiresAt`, leaving room for retries. */
const RENEW_LEAD_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

/** Minimum spacing between network attempts, shared across all contexts. */
const RENEW_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Storage key holding the last attempt timestamp (the cross-context throttle). */
const LAST_ATTEMPT_KEY = 'better-sidebar-license-renew-attempt';

/** In-process guard so concurrent callers share one request. */
let inFlight: Promise<void> | null = null;

/**
 * Wait until the persisted license state has been read from storage.
 *
 * Without this, a renewal check that runs at startup would read the store's
 * initial defaults (`isActivated: false`) and decide there is nothing to renew.
 */
async function waitForHydration(): Promise<void> {
  if (useLicenseStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsub = useLicenseStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
    // Storage reads can fail silently in odd contexts; don't hang forever.
    setTimeout(resolve, 5000);
  });
}

async function getLastAttempt(): Promise<number> {
  try {
    const result = await browser.storage.local.get(LAST_ATTEMPT_KEY);
    const value = result?.[LAST_ATTEMPT_KEY];
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

async function setLastAttempt(ts: number): Promise<void> {
  try {
    await browser.storage.local.set({ [LAST_ATTEMPT_KEY]: ts });
  } catch {
    // Throttling is best-effort; a failed write just means we may retry sooner.
  }
}

/** True when the validation window is close enough to expiry to warrant renewing. */
function isDueForRenewal(expiresAt: number | null): boolean {
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - RENEW_LEAD_MS;
}

/**
 * Renew the stored license if it's approaching expiry.
 *
 * Safe to call often — it no-ops when there's nothing activated, when the
 * validation window is still comfortable, or when another context tried
 * recently. Never throws.
 *
 * @param options.force Skip the "is it due" and throttle checks. Used by the
 *   settings panel when the user asks to retry now.
 */
export async function renewLicenseIfNeeded(
  options: { force?: boolean } = {},
): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runRenewal(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRenewal({ force = false }: { force?: boolean }): Promise<void> {
  try {
    await waitForHydration();

    const state = useLicenseStore.getState();
    const { token, deviceId, expiresAt } = state;

    // Nothing to renew. A token kept around purely to explain a past rejection
    // is not retried automatically — only when the user asks.
    if (!token) return;
    if (!state.isActivated && !force) return;

    if (!force) {
      if (!isDueForRenewal(expiresAt)) return;

      const lastAttempt = await getLastAttempt();
      if (Date.now() - lastAttempt < RENEW_MIN_INTERVAL_MS) return;
    }

    await setLastAttempt(Date.now());

    const result = await revalidateLicense(token, deviceId);

    if (result.success) {
      useLicenseStore
        .getState()
        .markRenewed(result.signedPayload, result.expiresAt, result.tier);
      console.log('[License] Renewed until', new Date(result.expiresAt).toISOString());
      return;
    }

    const failure = classifyValidationFailure(result.error);

    if (failure === 'rejected') {
      useLicenseStore.getState().markRenewRejected(result.error || 'validation_failed');
      console.warn('[License] Server rejected the license:', result.error);
      return;
    }

    useLicenseStore.getState().markRenewUnreachable(result.error || 'network_error');
    console.warn('[License] Renewal could not reach the server:', result.error);
  } catch (err) {
    // A crash here must not cost the user their license either.
    console.error('[License] Renewal check failed:', err);
  }
}

/**
 * Register the periodic renewal alarm. Call once at service worker startup.
 *
 * Alarms are the only timer that survives service worker suspension, so this is
 * what actually keeps long-lived installs validated.
 */
export function registerLicenseRenewalAlarm(): void {
  browser.alarms.create(LICENSE_RENEWAL_ALARM, {
    periodInMinutes: RENEWAL_CHECK_INTERVAL_MINUTES,
    // Run one check shortly after startup too, to catch installs that were
    // offline (or on an older build) when their window lapsed.
    delayInMinutes: 1,
  });
}

/** Handle the renewal alarm. Wire this into `browser.alarms.onAlarm`. */
export async function handleLicenseRenewalAlarm(
  alarm: { name: string },
): Promise<void> {
  if (alarm.name !== LICENSE_RENEWAL_ALARM) return;
  await renewLicenseIfNeeded();
}

/**
 * Best-effort renewal trigger for page contexts.
 *
 * The background alarm is the primary path; this covers the case where the
 * worker was asleep or the alarm was dropped. The shared throttle keeps it from
 * multiplying across open tabs.
 */
export function scheduleRenewalCheckFromPage(): void {
  void renewLicenseIfNeeded().catch(() => {
    // Already logged inside runRenewal.
  });
}
