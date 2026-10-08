import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import { flushPendingSync } from '@/shared/lib/gdrive';
import { notifyDataUpdated } from '../notify';

/**
 * Manual "check for updates" from the About page.
 *
 * Chrome checks the store on its own every few hours; this only lets the user ask now.
 * The flow is two steps because the store answers before the package is on disk:
 * `requestUpdateCheck` says a version exists and starts the download, and
 * `onUpdateAvailable` fires once it has landed. Only then does `runtime.reload()`
 * actually swap versions — reloading earlier just restarts the old one.
 */

export type UpdateCheckStatus =
  /** Downloaded and waiting for a reload. */
  | 'ready'
  /** The store has a newer version; the download is still in flight. */
  | 'update_available'
  | 'no_update'
  /** Chrome refuses checks that come too close together. */
  | 'throttled'
  /** No update API here (some Firefox builds, unpacked dev loads still answer `no_update`). */
  | 'unsupported';

/**
 * `storage.session` rather than a module variable: the worker can sleep between the
 * download finishing and the user clicking "Update now".
 */
const PENDING_UPDATE_KEY = 'pendingExtensionUpdate';

/** How long "Update now" waits for a download that was still in flight. */
const DOWNLOAD_WAIT_MS = 30_000;

/**
 * Periodic background check, so the toast can show up without anyone opening About.
 *
 * Chrome already polls the store every few hours on its own; this only shortens the gap.
 * Kept well apart so it never eats into the throttle budget of the manual button.
 */
export const UPDATE_CHECK_ALARM = 'extension-update-check';
const UPDATE_CHECK_PERIOD_MIN = 180;

/** Tabs that run the overlay and can show the update toast. */
const OVERLAY_TAB_URLS = [
  'https://aistudio.google.com/*',
  'https://gemini.google.com/*',
  'https://chatgpt.com/*',
];

/** Tell open overlays that an update is downloaded, so they can show the toast. */
async function broadcastUpdateReady(version: string): Promise<void> {
  const message = { type: 'EXTENSION_UPDATE_READY', payload: { version } };
  try {
    const tabs = await browser.tabs.query({ url: OVERLAY_TAB_URLS });
    for (const tab of tabs) {
      if (tab.id != null) browser.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (err) {
    console.error('[Update] Failed to notify tabs:', err);
  }
}

/** Registered at worker startup so a download finished at any time is remembered. */
export function registerUpdateAvailableListener(): void {
  browser.runtime.onUpdateAvailable?.addListener((details) => {
    chrome.storage.session
      .set({ [PENDING_UPDATE_KEY]: details.version })
      .catch((err) => console.error('[Update] Failed to record pending update:', err));
    broadcastUpdateReady(details.version);
  });
}

export function registerUpdateCheckAlarm(): void {
  if (typeof browser.runtime.requestUpdateCheck !== 'function') return;
  browser.alarms
    .get(UPDATE_CHECK_ALARM)
    .then((existing) => {
      if (existing) return;
      return browser.alarms.create(UPDATE_CHECK_ALARM, {
        delayInMinutes: UPDATE_CHECK_PERIOD_MIN,
        periodInMinutes: UPDATE_CHECK_PERIOD_MIN,
      });
    })
    .catch((err) => console.error('[Update] Failed to register check alarm:', err));
}

/**
 * Only starts the check: if the store has something, Chrome downloads it and
 * `onUpdateAvailable` takes it from there.
 */
export async function handleUpdateCheckAlarm(): Promise<void> {
  if (await getPendingVersion()) return;
  const result = await checkForUpdate();
  console.log('[Update] Periodic check:', result.status, result.version ?? '');
}

async function getPendingVersion(): Promise<string | null> {
  const stored = (await chrome.storage.session.get(PENDING_UPDATE_KEY))[PENDING_UPDATE_KEY];
  // A pending entry for the version already running is left over from before a reload.
  if (typeof stored !== 'string' || stored === browser.runtime.getManifest().version) {
    return null;
  }
  return stored;
}

function waitForPendingVersion(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (version: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.storage.session.onChanged.removeListener(onChanged);
      resolve(version);
    };
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      const next = changes[PENDING_UPDATE_KEY]?.newValue;
      if (typeof next === 'string') finish(next);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    chrome.storage.session.onChanged.addListener(onChanged);
    // Checked after subscribing so a write landing in between is not missed.
    getPendingVersion().then((v) => v && finish(v));
  });
}

async function checkForUpdate(): Promise<{ status: UpdateCheckStatus; version?: string }> {
  const pending = await getPendingVersion();
  if (pending) return { status: 'ready', version: pending };

  if (typeof browser.runtime.requestUpdateCheck !== 'function') {
    return { status: 'unsupported' };
  }

  const result: unknown = await browser.runtime.requestUpdateCheck();
  // Chrome resolves `{ status, version }`; older promise wrappers resolve `[status, { version }]`.
  const [status, version] = Array.isArray(result)
    ? [result[0] as string, (result[1] as { version?: string } | undefined)?.version]
    : [
        (result as { status?: string })?.status,
        (result as { version?: string })?.version,
      ];

  if (status === 'update_available' || status === 'no_update' || status === 'throttled') {
    return { status, version };
  }
  return { status: 'unsupported' };
}

export async function handleExtensionUpdate(
  message: ExtensionMessage,
): Promise<ExtensionResponse | null> {
  // Asked by every overlay on load. Reads only what is already downloaded, never the
  // store, so page loads cannot trip the throttle.
  if (message.type === 'GET_PENDING_EXTENSION_UPDATE') {
    return { success: true, data: { version: await getPendingVersion() } };
  }

  if (message.type === 'CHECK_EXTENSION_UPDATE') {
    return { success: true, data: await checkForUpdate() };
  }

  if (message.type === 'APPLY_EXTENSION_UPDATE') {
    const version = await waitForPendingVersion(DOWNLOAD_WAIT_MS);
    if (!version) return { success: false, error: 'not_ready' };

    // Push any debounced Drive upload before the worker goes away with it.
    await flushPendingSync(() => notifyDataUpdated()).catch((err) =>
      console.error('[Update] Pending sync flush failed:', err),
    );

    // Deferred so this response reaches the page before the extension restarts.
    setTimeout(() => browser.runtime.reload(), 300);
    return { success: true, data: { version } };
  }

  return null;
}
