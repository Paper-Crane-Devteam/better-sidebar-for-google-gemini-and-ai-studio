import type { Batch, BrowserSettings } from './contracts';
import { DEFAULT_SETTINGS } from './contracts';

// A separate database: deliberately absent from SQL exports, Drive sync and backups.
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('browser-agent-local-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('batches', { keyPath: 'id' });
      request.result.createObjectStore('settings');
      request.result.createObjectStore('labels');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(request.error); };
  });
}
async function transaction<T>(store: string, write: boolean, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, write ? 'readwrite' : 'readonly');
    const request = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Local audit storage failed.'));
  });
}
export const localAudit = {
  settings: async (): Promise<BrowserSettings> => (await transaction<BrowserSettings | undefined>('settings', false, s => s.get('current'))) ?? structuredClone(DEFAULT_SETTINGS),
  saveSettings: (settings: BrowserSettings) => transaction('settings', true, s => s.put(settings, 'current')),
  get: (id: string) => transaction<Batch | undefined>('batches', false, s => s.get(id)),
  save: (batch: Batch) => transaction('batches', true, s => s.put(batch)),
  all: () => transaction<Batch[]>('batches', false, s => s.getAll()),
  labels: async (epoch: string): Promise<Record<string, string>> => (await transaction<Record<string, string> | undefined>('labels', false, s => s.get(epoch))) ?? {},
  saveLabels: (epoch: string, labels: Record<string, string>) => transaction('labels', true, s => s.put(labels, epoch)),
};
