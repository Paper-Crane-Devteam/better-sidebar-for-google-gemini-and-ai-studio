import { initDB } from '@/shared/db';
import { getDbNameForActiveProfile } from '@/shared/lib/profile-registry';
import { setCurrentDbName } from './tab-profile-map';

export const dbReady = (async () => {
  try {
    const dbName = await getDbNameForActiveProfile();
    console.log(`Initializing database with profile DB: ${dbName}`);
    await initDB(dbName);
    setCurrentDbName(dbName);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  }
})();
