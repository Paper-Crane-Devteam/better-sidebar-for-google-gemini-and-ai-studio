import { initDB } from '@/shared/db';
import { getDbNameForActiveProfile } from '@/shared/lib/profile-registry';

let opening: Promise<void> | null = null;

const openActiveProfileDb = async () => {
  const dbName = await getDbNameForActiveProfile();
  console.log(`Initializing database with profile DB: ${dbName}`);
  await initDB(dbName);
  console.log('Database initialized successfully');
};

/**
 * Resolve once the active profile's database is open.
 *
 * The result is cached, but only while it is good: a failed attempt is thrown
 * away so the next caller starts a new one. Caching the rejection instead is
 * what turns a single bad open into a dead extension — every message handler
 * awaits this, and the page keeps the service worker alive by talking to it, so
 * one transient failure (offscreen document being recreated, storage handle
 * revoked while the machine slept) would keep answering "database unavailable"
 * until the worker finally idles out.
 */
export const ensureDbReady = (): Promise<void> => {
  if (!opening) {
    opening = openActiveProfileDb().catch((err) => {
      console.error('Database initialization failed:', err);
      opening = null;
      throw err;
    });
  }
  return opening;
};

// Start opening as soon as the service worker boots so the first message does
// not have to wait for the whole handshake.
//
// Deferred by one task on purpose: imports are hoisted, so a synchronous call
// here would run before `defineBackground()` has registered the transport and
// store RPC bridge. On a cold start that puts the DB open (offscreen document +
// sqlite WASM) ahead of the handshake every UI surface is waiting on, which is
// exactly what made the popup feel unresponsive on the first click.
setTimeout(() => {
  ensureDbReady().catch(() => {
    // Already logged; the next caller retries.
  });
}, 0);
