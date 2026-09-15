/**
 * One backfill worker per platform, no matter how many tabs are open.
 *
 * Several Gemini tabs would otherwise each run their own schedule against the
 * same conversation list — the same requests, several times over, which is the
 * one thing this feature must not do.
 *
 * A `storage.local` key with a heartbeat rather than a negotiation between tabs:
 * the holder can be closed mid-cycle, so the lock has to be able to expire on its
 * own. Two tabs can still briefly overlap if they claim it in the same
 * millisecond; that costs a few duplicate requests, and the writes are upserts,
 * so it is not worth a real consensus protocol.
 */

import { BACKFILL_LOCK_TTL_MS } from '@/shared/constants/backfill';

interface LockValue {
  owner: string;
  ts: number;
}

/**
 * Owner identity that survives a reload but not a new tab.
 *
 * `sessionStorage` is exactly that scope. A fresh random id per page load looked
 * equivalent and was not: reloading a tab produced a *new* owner while the old
 * owner's heartbeat was still inside the TTL, so the tab locked itself out of its
 * own work for minutes — and did it silently, because from the lock's point of
 * view a stale heartbeat and a live sibling tab are indistinguishable.
 *
 * Releasing on `pagehide` does not fix that on its own: the write is async and a
 * page being torn down is not guaranteed to finish it.
 *
 * The key is namespaced because this is the host page's `sessionStorage`, not ours.
 */
function stableOwnerId(platform: string): string {
  const key = `__bs_backfill_owner_${platform}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    // Storage blocked (rare, but partitioned/blocked storage is a real state).
    // A per-page id still works; it only reintroduces the self-lockout above,
    // which costs a delay rather than correctness.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class BackfillLock {
  private readonly key: string;
  private readonly owner: string;
  /** So "another tab is doing it" is said once, not every cycle. */
  private reportedContention = false;

  constructor(private readonly platform: string) {
    this.key = `bs-backfill-lock-${platform}`;
    this.owner = stableOwnerId(platform);
  }

  /**
   * Take or renew the lock, reporting whether this tab may proceed.
   *
   * Renewing on every cycle doubles as the heartbeat, so there is no separate
   * timer to keep alive.
   */
  async acquire(): Promise<boolean> {
    try {
      const stored = await browser.storage.local.get(this.key);
      const current = stored?.[this.key] as LockValue | undefined;

      const heldByOther =
        current &&
        current.owner !== this.owner &&
        Date.now() - current.ts < BACKFILL_LOCK_TTL_MS;
      if (heldByOther) {
        if (!this.reportedContention) {
          this.reportedContention = true;
          console.log(
            `[Backfill] Another ${this.platform} tab is handling the backfill; standing by`,
          );
        }
        return false;
      }

      this.reportedContention = false;
      await browser.storage.local.set({
        [this.key]: { owner: this.owner, ts: Date.now() } satisfies LockValue,
      });
      return true;
    } catch {
      // Storage is unavailable, so we cannot tell whether another tab is working.
      // Standing down is the safe read: the cost is a delayed backfill, and the
      // alternative is every tab deciding it is the leader.
      return false;
    }
  }

  /**
   * Give the lock up so another tab can take over immediately instead of waiting
   * out the TTL. Best effort — a closing tab may not get to run this.
   */
  async release(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(this.key);
      const current = stored?.[this.key] as LockValue | undefined;
      if (current?.owner !== this.owner) return;
      await browser.storage.local.remove(this.key);
    } catch {
      // The TTL is the backstop.
    }
  }
}
