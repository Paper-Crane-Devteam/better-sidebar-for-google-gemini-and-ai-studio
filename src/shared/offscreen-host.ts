/**
 * The offscreen document, owned in one place.
 *
 * Chrome allows exactly **one** offscreen document per extension, and
 * `offscreen.createDocument()` rejects if one already exists. Two subsystems now need
 * it — the SQLite worker and the document engine — and each probing-and-creating on its
 * own is a race with a guaranteed loser: whoever calls second gets
 * "Only a single offscreen document may be created", and if that rejection is treated as
 * a failure the subsystem gives up on a host that is actually there.
 *
 * So creation lives here, behind a single in-flight promise, and both callers ask this
 * module instead of the API.
 *
 * ⚠️ Firefox has no `offscreen` API at all. `available: false` is a normal answer, not an
 * error — callers fall back to creating a Worker from the background page (which Firefox
 * allows because its background is a page, not a service worker).
 */

export interface OffscreenStatus {
  /** False when the browser has no offscreen API. Fall back to a local Worker. */
  available: boolean;
  /**
   * True when this call had to bring the document into existence — including the case
   * where a concurrent caller won the race.
   *
   * Callers use it to decide whether the workers inside are freshly built and therefore
   * know nothing: the DB bridge replays `INIT` on the strength of this flag.
   */
  created: boolean;
}

/** Shared in-flight creation, so concurrent callers await the same attempt. */
let creating: Promise<void> | null = null;

export async function ensureOffscreenDocument(): Promise<OffscreenStatus> {
  // @ts-ignore - `offscreen` is absent from some versions of the polyfill's types
  const api = typeof browser !== 'undefined' ? browser.offscreen : undefined;
  if (!api) return { available: false, created: false };

  if (await hasOffscreenDocument()) return { available: true, created: false };

  if (!creating) {
    creating = createDocument().finally(() => {
      creating = null;
    });
  }
  await creating;

  return { available: true, created: true };
}

async function hasOffscreenDocument(): Promise<boolean> {
  // @ts-ignore - getContexts is missing from older type definitions
  if (!browser.runtime.getContexts) return false;
  try {
    // @ts-ignore
    const contexts = await browser.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as any],
    });
    return contexts.length > 0;
  } catch (e) {
    // An unusable probe means "assume not there" and let creation decide — it reports an
    // existing document by throwing, which we already tolerate below.
    console.warn('[Offscreen] getContexts check failed', e);
    return false;
  }
}

async function createDocument(): Promise<void> {
  try {
    // @ts-ignore
    await browser.offscreen.createDocument({
      url: 'offscreen.html',
      // @ts-ignore
      reasons: [browser.offscreen.Reason.WORKERS],
      justification:
        'Run SQLite WASM and Office document parsing in Web Workers, off the ' +
        'service worker thread',
    });
  } catch (err: any) {
    if (err?.message?.startsWith('Only a single offscreen')) {
      // Someone else created it between our probe and this call. A document exists,
      // which is all anyone needed.
      return;
    }
    console.error('[Offscreen] Failed to create document:', err);
    throw err;
  }
}
