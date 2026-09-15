/**
 * Cooldown record for conversations the backfill asked about and got nothing for.
 *
 * A conversation that had no transcript and now has one needs no bookkeeping: it
 * stops matching the candidate query the moment the messages land, so the DB *is*
 * the record of success.
 *
 * Everything else needs remembering, because it keeps matching the query. An empty
 * chat stays empty. A chat that looks stale — `last_active_at` ahead of its newest
 * message — often is not, and asking again returns the same transcript, leaving it
 * just as stale as before. Without a growing cooldown either of those would be
 * re-fetched on every single cycle for the life of the install.
 *
 * Kept in `storage.local` rather than a column on `conversations` deliberately:
 * it is transient scheduling state, not user data, and it should not travel
 * through Drive sync, backups or exports.
 */

import {
  BACKFILL_COOLDOWN_MS,
  BACKFILL_LEDGER_MAX_AGE_MS,
  BACKFILL_LEDGER_MAX_ENTRIES,
} from '@/shared/constants/backfill';

interface LedgerEntry {
  /** When the last unproductive attempt happened (ms). */
  at: number;
  /** Consecutive unproductive attempts, used to pick the cooldown. */
  n: number;
}

type LedgerData = Record<string, LedgerEntry>;

const storageKey = (platform: string) => `bs-backfill-ledger-${platform}`;

function cooldownFor(misses: number): number {
  const i = Math.min(Math.max(misses, 1), BACKFILL_COOLDOWN_MS.length) - 1;
  return BACKFILL_COOLDOWN_MS[i];
}

export class BackfillLedger {
  private readonly key: string;
  private data: LedgerData | null = null;

  constructor(platform: string) {
    this.key = storageKey(platform);
  }

  private async load(): Promise<LedgerData> {
    if (this.data) return this.data;
    try {
      const stored = await browser.storage.local.get(this.key);
      const raw = stored?.[this.key];
      this.data = raw && typeof raw === 'object' ? (raw as LedgerData) : {};
    } catch {
      // A ledger we cannot read costs us a few redundant requests, not
      // correctness. Carry on with an empty one.
      this.data = {};
    }
    return this.data;
  }

  private async persist(): Promise<void> {
    if (!this.data) return;
    try {
      await browser.storage.local.set({ [this.key]: this.data });
    } catch {
      // Same story: losing the write only means the cooldown is not honoured.
    }
  }

  /**
   * Conversations that are still cooling down.
   *
   * Handed to the candidate query as `excludeIds`, so the DB skips them before
   * applying its LIMIT.
   */
  async cooldownIds(): Promise<string[]> {
    const data = await this.load();
    const now = Date.now();
    return Object.entries(data)
      .filter(([, e]) => now < e.at + cooldownFor(e.n))
      .map(([id]) => id);
  }

  /**
   * Put this conversation on cooldown: we asked, and we cannot show that anything
   * was gained by asking.
   *
   * Covers the empty answer, the unparseable one, and the refresh of a chat that
   * merely *looked* stale — see the runner for why the last of those is the common
   * case rather than the exotic one.
   */
  async recordAttempt(id: string): Promise<void> {
    const data = await this.load();
    const previous = data[id];
    data[id] = { at: Date.now(), n: (previous?.n ?? 0) + 1 };
    this.prune(data);
    await this.persist();
  }

  /**
   * Forget a conversation.
   *
   * Called after a productive fetch so a chat that was empty when we first asked
   * (and has since been used) starts from a clean slate rather than inheriting an
   * old cooldown.
   */
  async clear(id: string): Promise<void> {
    const data = await this.load();
    if (!(id in data)) return;
    delete data[id];
    await this.persist();
  }

  private prune(data: LedgerData): void {
    const cutoff = Date.now() - BACKFILL_LEDGER_MAX_AGE_MS;
    for (const [id, entry] of Object.entries(data)) {
      if (entry.at < cutoff) delete data[id];
    }

    const ids = Object.keys(data);
    if (ids.length <= BACKFILL_LEDGER_MAX_ENTRIES) return;

    // Oldest first, so what survives is the record of what we tried recently.
    ids
      .sort((a, b) => data[a].at - data[b].at)
      .slice(0, ids.length - BACKFILL_LEDGER_MAX_ENTRIES)
      .forEach((id) => delete data[id]);
  }
}
